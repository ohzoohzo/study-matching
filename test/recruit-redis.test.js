// npm test: 실제 Upstash Redis 저장소 확인 (KV_REST_API_URL·KV_REST_API_TOKEN이 있을 때만 돌아요)
//   vercel env pull .env.local && node --env-file=.env.local --test test/recruit-redis.test.js
// 테스트마다 recruit:test:<무작위>: 아래에만 쓰고, 끝나면 그 키만 지워요.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { redisStore } from "../api/_lib/store.js";
import { createStudy, saveMe, applyStudy, decideApp, getState } from "../api/_lib/recruit.js";

const on = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

test("Redis에 저장한 스터디·신청·수락을 다시 읽어요", { skip: !on && "Redis 환경변수가 없어서 건너뛰어요" }, async () => {
  const store = redisStore({ prefix: "recruit:test:" + randomUUID() + ":" });
  try {
    const A = { id: "me-g1", sub: "1" }, B = { id: "me-g2", sub: "2" };
    await saveMe(store, A, { name: "모집자A", role: "dev" });
    await saveMe(store, B, { name: "신청자B", role: "design" });
    const { study } = await createStudy(store, A, { title: "Redis 확인 스터디", days: ["화"], mode: "오프라인", capacity: 2, goal: "저장하고 다시 읽기" });
    const { app } = await applyStudy(store, B, { studyId: study.id, message: "같이 해요" });
    await decideApp(store, A, app.id, { status: "accepted" });
    const st = await getState(store);
    assert.deepEqual(st.people.map((p) => p.id), ["me-g1", "me-g2"]);
    assert.equal(st.studies[0].title, "Redis 확인 스터디");
    assert.deepEqual(st.apps.map((a) => [a.personId, a.status]), [["me-g2", "accepted"]]);
  } finally {
    await store.dropAll();
  }
});
