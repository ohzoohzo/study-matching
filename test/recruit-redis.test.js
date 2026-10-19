// npm test: 실제 Upstash Redis 저장소 확인 (KV_REST_API_URL·KV_REST_API_TOKEN이 있을 때만 돌아요)
//   vercel env pull .env.local && node --env-file=.env.local --test test/recruit-redis.test.js
// 테스트마다 recruit:test:<무작위>: 아래에만 쓰고, 끝나면 그 키만 지워요.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { redisStore } from "../api/_lib/store.js";
import { createStudy, saveMe, applyStudy, decideApp, withdrawApp, updateStudy, getState, deleteMe } from "../api/_lib/recruit.js";

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

test("Redis에 저장한 신청 거두기·다시 열기·모집 취소를 다시 읽어요", { skip: !on && "Redis 환경변수가 없어서 건너뛰어요" }, async () => {
  const store = redisStore({ prefix: "recruit:test:" + randomUUID() + ":" });
  try {
    const A = { id: "me-g1", sub: "1" }, B = { id: "me-g2", sub: "2" };
    await saveMe(store, A, { name: "모집자A", role: "dev" });
    await saveMe(store, B, { name: "신청자B", role: "design" });
    const { study } = await createStudy(store, A, { title: "Redis 취소 확인", days: ["수"], mode: "오프라인", capacity: 3, goal: "취소하고 다시 읽기" });
    const { app } = await applyStudy(store, B, { studyId: study.id });
    await withdrawApp(store, B, app.id);
    await updateStudy(store, A, study.id, { closed: true });
    await updateStudy(store, A, study.id, { closed: false });
    await updateStudy(store, A, study.id, { canceled: true });
    const st = await getState(store);
    assert.deepEqual(st.apps.map((a) => a.status), ["withdrawn"]);
    assert.equal(st.studies[0].closed, false);
    assert.equal(st.studies[0].canceled, true);
  } finally {
    await store.dropAll();
  }
});

test("Redis에 브라우저 푸시 구독을 저장·삭제하고, 공개 목록(load)에는 넣지 않아요", { skip: !on && "Redis 환경변수가 없어서 건너뛰어요" }, async () => {
  const store = redisStore({ prefix: "recruit:test:" + randomUUID() + ":" });
  try {
    const sub = { endpoint: "https://fcm.googleapis.com/send/redis-test", keys: { p256dh: "p", auth: "a" } };
    assert.deepEqual(await store.getSubs("me-g1"), []);
    await store.setSubs("me-g1", [sub]);
    assert.deepEqual(await store.getSubs("me-g1"), [sub]);
    assert.ok(!JSON.stringify(await store.load()).includes("redis-test"));
    await store.setSubs("me-g1", []);
    assert.deepEqual(await store.getSubs("me-g1"), []);
  } finally {
    await store.dropAll();
  }
});

test("Redis에 사이트 알림함을 저장하고, 공개 목록(load)에는 넣지 않아요", { skip: !on && "Redis 환경변수가 없어서 건너뛰어요" }, async () => {
  const store = redisStore({ prefix: "recruit:test:" + randomUUID() + ":" });
  try {
    const note = { id: "n-redis", kind: "applied", studyId: "s-1", title: "새 신청이 왔어요", body: "redis-note-test", url: "/#/s/s-1", at: "2026-10-19T18:00", read: false };
    assert.deepEqual(await store.getNotes("me-g1"), []);
    await store.setNotes("me-g1", [note]);
    assert.deepEqual(await store.getNotes("me-g1"), [note]);
    assert.ok(!JSON.stringify(await store.load()).includes("redis-note-test"));
  } finally {
    await store.dropAll();
  }
});

test("Redis에서 탈퇴하면 프로필·구독·알림함 키가 지워지고 기록 속 id가 바뀌어요", { skip: !on && "Redis 환경변수가 없어서 건너뛰어요" }, async () => {
  const store = redisStore({ prefix: "recruit:test:" + randomUUID() + ":" });
  try {
    const A = { id: "me-g1", sub: "1" }, B = { id: "me-g2", sub: "2" };
    await saveMe(store, A, { name: "모집자A", role: "dev" });
    await saveMe(store, B, { name: "신청자B", role: "design" });
    const { study } = await createStudy(store, A, { title: "Redis 탈퇴 확인", days: ["화"], mode: "오프라인", capacity: 3, goal: "탈퇴하고 다시 읽기" });
    await applyStudy(store, B, { studyId: study.id });
    await store.setSubs("me-g1", [{ endpoint: "https://fcm.googleapis.com/send/x", keys: { p256dh: "p", auth: "a" } }]);
    await store.setNotes("me-g1", [{ id: "n-1", kind: "applied", studyId: study.id, title: "t", body: "b", url: "/", at: "2026-10-19T21:00", read: false }]);
    await deleteMe(store, A);
    const st = await getState(store);
    assert.deepEqual(st.people.map((p) => p.id), ["me-g2"]);
    assert.equal(st.studies[0].canceled, true);
    assert.match(st.studies[0].leaderId, /^gone-/);
    assert.ok(!JSON.stringify(st).includes("me-g1"));
    assert.deepEqual(await store.getSubs("me-g1"), []);
    assert.deepEqual(await store.getNotes("me-g1"), []);
  } finally {
    await store.dropAll();
  }
});
