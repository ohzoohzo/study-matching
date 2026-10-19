// 데이터 읽고 쓰기는 이 파일 한 곳에서만 해요.
// 배포에서는 Vercel Storage에 붙인 Upstash Redis를 쓰고, 테스트에서는 메모리 저장소를 써요.
//
// Redis 키 (<환경>은 prod · preview · development라서 vercel dev로 확인해도 실제 데이터와 섞이지 않아요)
//   recruit:<환경>:people   해시  사람 id → {id, name, role, tags} JSON (tags는 # 없는 해시태그 목록, 예전 프로필에는 없어요. 이메일은 두지 않아요)
//   recruit:<환경>:studies  해시  스터디 id → 스터디 JSON
//   recruit:<환경>:apps     해시  신청 id → 신청 JSON
//   recruit:<환경>:subs     해시  사람 id → 브라우저 푸시 구독 목록 JSON (기기마다 하나, 공개 목록 state에는 나오지 않아요)
//   recruit:<환경>:seq      번호  s-1, a-2처럼 id를 만들 때 하나씩 올려요
//   recruit:<환경>:lock:…   잠금  같은 스터디의 신청·수락·마감이 동시에 겹치지 않게 잠깐 잡아요
import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { HttpError } from "./errors.js";

const KINDS = ["people", "studies", "apps"];
const seqOf = (id) => Number(String(id).split("-").pop()) || 0;

// 해시는 순서를 지켜 주지 않아서 만든 순서(id 번호)로 다시 세워요. 다시 신청하면 마지막 신청이 내 신청이에요.
function ordered({ people, studies, apps }) {
  return {
    people: people.slice().sort((a, b) => a.id.localeCompare(b.id)),
    studies: studies.slice().sort((a, b) => seqOf(a.id) - seqOf(b.id)),
    apps: apps.slice().sort((a, b) => seqOf(a.id) - seqOf(b.id)),
  };
}

export function envName(env = process.env) {
  return env.VERCEL_ENV === "production" ? "prod" : env.VERCEL_ENV || "local";
}

export function redisStore({ env = process.env, prefix } = {}) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new HttpError(503, "저장소가 아직 연결되지 않았어요. 잠시 뒤 다시 시도해 주세요.");
  const redis = new Redis({ url, token, automaticDeserialization: false });
  const base = prefix || "recruit:" + envName(env) + ":";
  const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  // hgetall은 { 키: 값 }이나, 파이프라인에서는 [키, 값, 키, 값 …]으로 와요
  const parse = (h) => (Array.isArray(h) ? h.filter((_, i) => i % 2) : Object.values(h || {})).map((v) => JSON.parse(v));

  return {
    async load() {
      const p = redis.pipeline();
      KINDS.forEach((k) => p.hgetall(base + k));
      const [people, studies, apps] = await p.exec();
      return ordered({ people: parse(people), studies: parse(studies), apps: parse(apps) });
    },
    async get(kind, id) {
      const v = await redis.hget(base + kind, id);
      return v ? JSON.parse(v) : null;
    },
    async put(kind, obj) {
      await redis.hset(base + kind, { [obj.id]: JSON.stringify(obj) });
    },
    async nextId(p) {
      return p + "-" + (await redis.incr(base + "seq"));
    },
    async getSubs(personId) {
      const v = await redis.hget(base + "subs", personId);
      return v ? JSON.parse(v) : [];
    },
    async setSubs(personId, list) {
      if (list.length) await redis.hset(base + "subs", { [personId]: JSON.stringify(list) });
      else await redis.hdel(base + "subs", personId);
    },
    async withLock(name, fn) {
      const key = base + "lock:" + name, mine = randomUUID();
      for (let i = 0; i < 25; i++) {
        if (await redis.set(key, mine, { nx: true, px: 8000 })) {
          try { return await fn(); } finally { await redis.eval(RELEASE, [key], [mine]).catch(() => {}); }
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      throw new HttpError(503, "다른 요청을 처리하고 있어요. 잠시 뒤 다시 시도해 주세요.");
    },
    // 테스트가 만든 키만 지울 때 써요 (npm test의 Redis 확인)
    async dropAll() {
      const keys = await redis.keys(base + "*");
      if (keys.length) await redis.del(...keys);
    },
  };
}

// 테스트용: Redis와 같은 모양이고, 기다림이 끼게 해서 동시 요청도 실제처럼 겹쳐요
export function memoryStore() {
  const data = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
  const subs = new Map();
  const tick = () => new Promise((r) => setImmediate(r));
  let seq = 0;
  let chain = Promise.resolve();
  return {
    async load() {
      await tick();
      return ordered(Object.fromEntries(KINDS.map((k) => [k, [...data[k].values()].map((x) => structuredClone(x))])));
    },
    async get(kind, id) { await tick(); const v = data[kind].get(id); return v ? structuredClone(v) : null; },
    async put(kind, obj) { await tick(); data[kind].set(obj.id, structuredClone(obj)); },
    async nextId(p) { await tick(); seq += 1; return p + "-" + seq; },
    async getSubs(id) { await tick(); return structuredClone(subs.get(id) || []); },
    async setSubs(id, list) { await tick(); if (list.length) subs.set(id, structuredClone(list)); else subs.delete(id); },
    withLock(name, fn) {
      const run = chain.then(() => fn());
      chain = run.then(() => {}, () => {});
      return run;
    },
  };
}
