// npm test: 공지용 스터디 모집 서버 함수 (/api/recruit/*)
// 구글 토큰 검증과 Redis는 테스트용으로 바꿔 끼워요. 규칙은 recruit-logic.js 그대로예요.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handler } from "../api/_lib/http.js";
import { memoryStore } from "../api/_lib/store.js";
import { GOOGLE_CLIENT_ID, makeVerifier } from "../api/_lib/auth.js";
import * as stateApi from "../api/recruit/state.js";
import * as meApi from "../api/recruit/me.js";
import * as studiesApi from "../api/recruit/studies.js";
import * as studyApi from "../api/recruit/studies/[id].js";
import * as appsApi from "../api/recruit/apps.js";
import * as appApi from "../api/recruit/apps/[id].js";

// 테스트용 구글 계정: 토큰 문자열 → 구글이 확인해 준 정보
const ACCOUNTS = {
  tokA: { sub: "111", name: "구글 이름 A", email: "a@example.com", exp: 9999999999 },
  tokB: { sub: "222", name: "구글 이름 B", email: "b@example.com", exp: 9999999999 },
  tokC: { sub: "333", name: "구글 이름 C", email: "c@example.com", exp: 9999999999 },
};
async function fakeVerify(token) {
  if (!ACCOUNTS[token]) throw new Error("bad token");
  return ACCOUNTS[token];
}

function setup() {
  const deps = { store: memoryStore(), verify: fakeVerify };
  return async function call(mod, method, { token, body, query } = {}) {
    const req = { method, headers: token ? { authorization: "Bearer " + token } : {}, body, query: query || {} };
    const res = {
      statusCode: 200, headers: {}, data: "",
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(d) { this.data = d; },
    };
    await handler(mod.methods, deps)(req, res);
    return { status: res.statusCode, body: JSON.parse(res.data), headers: res.headers };
  };
}

const study = { topic: "t4", title: "pandas로 CSV 분석해 보기", days: ["목", "화"], mode: "ZEP 온라인", capacity: 3, goal: "CSV를 읽어 필터·정렬·집계까지 해 보기" };

async function withPeople(call) {
  await call(meApi, "PUT", { token: "tokA", body: { name: "모집자A", role: "dev" } });
  await call(meApi, "PUT", { token: "tokB", body: { name: "신청자B", role: "design" } });
  await call(meApi, "PUT", { token: "tokC", body: { name: "신청자C", role: "po" } });
}

test("토큰 검증은 클라이언트 ID를 audience로 넘기고, 시크릿 없이 해요", async () => {
  let seen = null;
  const client = { verifyIdToken: async (opts) => { seen = opts; return { getPayload: () => ({ sub: "42", name: "N", email: "e@x", exp: 1 }) }; } };
  const verify = makeVerifier(client);
  assert.deepEqual(await verify("abc"), { sub: "42", name: "N", email: "e@x", exp: 1 });
  assert.deepEqual(seen, { idToken: "abc", audience: GOOGLE_CLIENT_ID });
  assert.equal(GOOGLE_CLIENT_ID, "27926126873-q4o4mr6s0bk5rcrcgqg43uclagsc1djo.apps.googleusercontent.com");
});

test("로그인하지 않았거나 토큰이 틀리면 쓰기 요청을 401로 막아요", async () => {
  const call = setup();
  assert.equal((await call(studiesApi, "POST", { body: study })).status, 401);
  assert.equal((await call(studiesApi, "POST", { token: "forged", body: study })).status, 401);
  assert.equal((await call(meApi, "PUT", { body: { name: "누구", role: "dev" } })).status, 401);
  assert.equal((await call(appsApi, "POST", { body: { studyId: "s-1" } })).status, 401);
  assert.equal((await call(appApi, "PATCH", { query: { id: "a-1" }, body: { status: "accepted" } })).status, 401);
  assert.equal((await call(studyApi, "PATCH", { query: { id: "s-1" }, body: { closed: true } })).status, 401);
});

test("사람 id는 me-g + 구글 sub이고, 같은 계정이면 프로필이 이어져요", async () => {
  const call = setup();
  let r = await call(meApi, "GET", { token: "tokA" });
  assert.equal(r.status, 200);
  assert.equal(r.body.person, null);
  assert.equal(r.body.account.name, "구글 이름 A");
  r = await call(meApi, "PUT", { token: "tokA", body: { name: "  모집자A ", role: "dev", id: "me-g999" } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.person, { id: "me-g111", name: "모집자A", role: "dev" });
  r = await call(meApi, "GET", { token: "tokA" });
  assert.deepEqual(r.body.person, { id: "me-g111", name: "모집자A", role: "dev" });
  // 이메일은 저장하지 않아요
  const s = await call(stateApi, "GET");
  assert.ok(!JSON.stringify(s.body).includes("a@example.com"));
});

test("프로필 입력 검사는 recruit-logic 규칙 그대로예요", async () => {
  const call = setup();
  const r = await call(meApi, "PUT", { token: "tokA", body: { name: "A", role: "ceo" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.name && r.body.fields.role);
});

test("한 사람이 연 스터디가 다른 사람 목록에 보여요", async () => {
  const call = setup();
  await withPeople(call);
  const r = await call(studiesApi, "POST", { token: "tokA", body: study });
  assert.equal(r.status, 201);
  assert.equal(r.body.study.leaderId, "me-g111");
  assert.deepEqual(r.body.study.days, ["화", "목"]); // 요일 순서로 정리해요
  assert.equal(r.body.study.closed, false);
  assert.match(r.body.study.createdAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  const seen = await call(stateApi, "GET"); // 로그인 안 한 사람도 목록은 봐요
  assert.equal(seen.status, 200);
  assert.equal(seen.headers["cache-control"], "no-store");
  assert.deepEqual(seen.body.studies.map((s) => s.title), [study.title]);
  assert.ok(seen.body.people.some((p) => p.id === "me-g111"));
});

test("스터디 입력 검사: 틀린 칸을 400으로 알려 주고, 이상한 값에도 500이 나지 않아요", async () => {
  const call = setup();
  await withPeople(call);
  let r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, title: "x", capacity: 9 } });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.title && r.body.fields.capacity);
  r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, days: "월" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.days);
  r = await call(studiesApi, "POST", { token: "tokA", body: null });
  assert.equal(r.status, 400);
});

test("프로필을 저장하기 전에는 스터디를 열거나 신청할 수 없어요", async () => {
  const call = setup();
  await call(meApi, "PUT", { token: "tokA", body: { name: "모집자A", role: "dev" } });
  const opened = await call(studiesApi, "POST", { token: "tokA", body: study });
  assert.equal((await call(studiesApi, "POST", { token: "tokB", body: study })).status, 403);
  assert.equal((await call(appsApi, "POST", { token: "tokB", body: { studyId: opened.body.study.id } })).status, 403);
});

test("신청 → 수락이 두 사람 화면에 서로 반영돼요", async () => {
  const call = setup();
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study;
  const applied = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id, message: "디자인 맡을게요" } });
  assert.equal(applied.status, 201);
  assert.equal(applied.body.app.personId, "me-g222");
  assert.equal(applied.body.app.status, "pending");
  // 모집자 화면: 대기 신청이 보여요
  let st = (await call(stateApi, "GET")).body;
  assert.deepEqual(st.apps.map((a) => [a.personId, a.status]), [["me-g222", "pending"]]);
  // 모집자가 수락
  const ok = await call(appApi, "PATCH", { token: "tokA", query: { id: applied.body.app.id }, body: { status: "accepted" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.app.status, "accepted");
  // 신청자 화면: 수락으로 바뀌어요
  st = (await call(stateApi, "GET")).body;
  assert.equal(st.apps.find((a) => a.personId === "me-g222").status, "accepted");
  // 중복 신청은 이유와 함께 409
  const again = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /이미 함께/);
});

test("모집자만 수락·거절·마감할 수 있어요 (서버에서 막아요)", async () => {
  const call = setup();
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study;
  const app = (await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } })).body.app;
  // 신청자 본인이나 다른 사람은 수락·거절할 수 없어요
  let r = await call(appApi, "PATCH", { token: "tokB", query: { id: app.id }, body: { status: "accepted" } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /모집자만/);
  r = await call(appApi, "PATCH", { token: "tokC", query: { id: app.id }, body: { status: "rejected" } });
  assert.equal(r.status, 403);
  r = await call(studyApi, "PATCH", { token: "tokB", query: { id: s.id }, body: { closed: true } });
  assert.equal(r.status, 403);
  // 상태 값은 accepted/rejected만 받아요
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: app.id }, body: { status: "pending" } });
  assert.equal(r.status, 400);
  // 모집자는 거절·마감할 수 있어요
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: app.id }, body: { status: "rejected" } });
  assert.equal(r.body.app.status, "rejected");
  r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { closed: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.study.closed, true);
  // 마감하면 신청이 막혀요
  r = await call(appsApi, "POST", { token: "tokC", body: { studyId: s.id } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /마감/);
  // 없는 스터디·신청은 404
  assert.equal((await call(studyApi, "PATCH", { token: "tokA", query: { id: "s-404" }, body: { closed: true } })).status, 404);
  assert.equal((await call(appApi, "PATCH", { token: "tokA", query: { id: "a-404" }, body: { status: "accepted" } })).status, 404);
});

test("동시에 수락해도 정원을 넘지 않아요", async () => {
  const call = setup();
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: { ...study, capacity: 2 } })).body.study; // 모집자 + 1명
  const b = (await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } })).body.app;
  const c = (await call(appsApi, "POST", { token: "tokC", body: { studyId: s.id } })).body.app;
  const results = await Promise.all([
    call(appApi, "PATCH", { token: "tokA", query: { id: b.id }, body: { status: "accepted" } }),
    call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "accepted" } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const st = (await call(stateApi, "GET")).body;
  assert.equal(st.apps.filter((a) => a.status === "accepted").length, 1);
});

test("정해진 방법이 아니면 405와 Allow를 돌려줘요", async () => {
  const call = setup();
  const r = await call(stateApi, "DELETE");
  assert.equal(r.status, 405);
  assert.equal(r.headers.allow, "GET");
});

test("dev 토큰은 로컬(vercel dev)에서 RECRUIT_DEV_AUTH=1일 때만 켜지고, 배포에서는 꺼져 있어요", async () => {
  const { devAuthOn } = await import("../api/_lib/auth.js");
  assert.equal(devAuthOn({ RECRUIT_DEV_AUTH: "1" }), true); // vercel dev는 VERCEL_ENV를 비워 둬요
  assert.equal(devAuthOn({ VERCEL_ENV: "development", RECRUIT_DEV_AUTH: "1" }), true);
  assert.equal(devAuthOn({ VERCEL_ENV: "production", RECRUIT_DEV_AUTH: "1" }), false);
  assert.equal(devAuthOn({ VERCEL_ENV: "preview", RECRUIT_DEV_AUTH: "1" }), false);
  assert.equal(devAuthOn({}), false);
  assert.equal(devAuthOn({ VERCEL_ENV: "development" }), false);
});
