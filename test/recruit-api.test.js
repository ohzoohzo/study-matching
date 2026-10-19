// npm test: 공지용 스터디 모집 서버 함수 (/api/recruit/*)
// 구글 토큰 검증과 Redis는 테스트용으로 바꿔 끼워요. 규칙은 recruit-logic.js 그대로예요.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handler } from "../api/_lib/http.js";
import { memoryStore } from "../api/_lib/store.js";
import { GOOGLE_CLIENT_ID, makeVerifier } from "../api/_lib/auth.js";
import { kstToday } from "../recruit/recruit-logic.js";
import * as stateApi from "../api/recruit/state.js";
import * as meApi from "../api/recruit/me.js";
import * as studiesApi from "../api/recruit/studies.js";
import * as studyApi from "../api/recruit/studies/[id].js";
import * as appsApi from "../api/recruit/apps.js";
import * as appApi from "../api/recruit/apps/[id].js";
import * as pushApi from "../api/recruit/push.js";

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

// 푸시는 테스트용으로 바꿔 끼워요: 보낸 알림을 call.sent에 모아요. send를 주면 그걸 쓰고, noPush면 알림 키가 없는 상태예요.
function setup({ send, noPush = false } = {}) {
  const sent = [];
  const push = noPush ? null : { publicKey: "test-public-key", send: send || (async (sub, payload) => { sent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); }) };
  const deps = { store: memoryStore(), verify: fakeVerify, push };
  const call = async function (mod, method, { token, body, query } = {}) {
    const req = { method, headers: token ? { authorization: "Bearer " + token } : {}, body, query: query || {} };
    const res = {
      statusCode: 200, headers: {}, data: "",
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(d) { this.data = d; },
    };
    await handler(mod.methods, deps)(req, res);
    return { status: res.statusCode, body: JSON.parse(res.data), headers: res.headers };
  };
  call.store = deps.store; // 날짜가 지난 상황처럼 저장소를 직접 바꿀 때만 써요
  call.sent = sent;
  return call;
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
  assert.ok(!("topic" in r.body.study)); // 권장 주제는 받지 않아요 (보내도 버려요)
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

// 모집자A가 열고, 신청자B는 수락, 신청자C는 대기인 스터디를 만들어요
async function studyWithApps(call) {
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study;
  const b = (await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } })).body.app;
  await call(appApi, "PATCH", { token: "tokA", query: { id: b.id }, body: { status: "accepted" } });
  const c = (await call(appsApi, "POST", { token: "tokC", body: { studyId: s.id } })).body.app;
  return { s, b, c };
}

test("로그인하지 않으면 모집 취소·다시 열기·신청 취소를 401로 막아요", async () => {
  const call = setup();
  assert.equal((await call(studyApi, "PATCH", { query: { id: "s-1" }, body: { canceled: true } })).status, 401);
  assert.equal((await call(studyApi, "PATCH", { query: { id: "s-1" }, body: { closed: false } })).status, 401);
  assert.equal((await call(appApi, "PATCH", { query: { id: "a-1" }, body: { status: "withdrawn" } })).status, 401);
  assert.equal((await call(studyApi, "PATCH", { token: "forged", query: { id: "s-1" }, body: { canceled: true } })).status, 401);
});

test("모집자가 스터디를 취소하면 다른 사람 목록과 신청에 반영돼요", async () => {
  const call = setup();
  const { s, b, c } = await studyWithApps(call);
  // 모집자가 아니면 취소할 수 없어요
  let r = await call(studyApi, "PATCH", { token: "tokB", query: { id: s.id }, body: { canceled: true } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /모집자만/);
  r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { canceled: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.study.canceled, true);
  assert.match(r.body.study.canceledAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  // 다른 사람이 받는 상태: 스터디는 지워지지 않고 canceled로 남고, 수락·대기 기록도 남아요
  const st = (await call(stateApi, "GET")).body;
  assert.equal(st.studies.find((x) => x.id === s.id).canceled, true);
  assert.deepEqual(st.apps.map((a) => [a.id, a.status]), [[b.id, "accepted"], [c.id, "pending"]]);
  // 취소한 스터디에는 신청·수락·마감·다시 취소가 막혀요
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "accepted" } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /취소/);
  r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { closed: true } });
  assert.equal(r.status, 409);
  r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { canceled: true } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /이미 취소/);
  r = await call(appApi, "PATCH", { token: "tokC", query: { id: c.id }, body: { status: "withdrawn" } });
  assert.equal(r.status, 409);
});

test("스터디 바꾸기는 마감·다시 열기·취소만 받아요 (취소를 되돌릴 수 없어요)", async () => {
  const call = setup();
  const { s } = await studyWithApps(call);
  for (const body of [{ canceled: false }, {}, { closed: "yes" }, { title: "바꾼 이름" }]) {
    const r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal((await call(studyApi, "PATCH", { token: "tokA", query: { id: "s-404" }, body: { canceled: true } })).status, 404);
});

test("모집자가 마감한 스터디를 다시 열면 다시 신청을 받아요", async () => {
  const call = setup();
  const { s } = await studyWithApps(call);
  await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { closed: true } });
  let r = await call(studyApi, "PATCH", { token: "tokB", query: { id: s.id }, body: { closed: false } });
  assert.equal(r.status, 403);
  r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { closed: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.study.closed, false);
  assert.equal((await call(stateApi, "GET")).body.studies[0].closed, false);
  // 마감하지 않은 스터디를 또 열면 409
  r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { closed: false } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /마감한 스터디만/);
});

test("신청자가 대기 중인 신청을 취소하면 모집자 화면에서 빠지고, 다시 신청할 수 있어요", async () => {
  const call = setup();
  const { s, b, c } = await studyWithApps(call);
  // 다른 사람(모집자 포함)은 남의 신청을 거둘 수 없어요
  let r = await call(appApi, "PATCH", { token: "tokB", query: { id: c.id }, body: { status: "withdrawn" } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /내 신청만/);
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "withdrawn" } });
  assert.equal(r.status, 403);
  // 수락된 신청은 거둘 수 없어요
  r = await call(appApi, "PATCH", { token: "tokB", query: { id: b.id }, body: { status: "withdrawn" } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /대기 중인 신청만/);
  // 신청자 본인은 거둘 수 있어요
  r = await call(appApi, "PATCH", { token: "tokC", query: { id: c.id }, body: { status: "withdrawn" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.app.status, "withdrawn");
  const st = (await call(stateApi, "GET")).body;
  assert.deepEqual(st.apps.filter((a) => a.status === "pending"), []);
  // 거둔 신청은 수락할 수 없어요
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "accepted" } });
  assert.equal(r.status, 409);
  // 다시 신청하면 새 대기 신청이 생겨요
  r = await call(appsApi, "POST", { token: "tokC", body: { studyId: s.id, message: "다시 할게요" } });
  assert.equal(r.status, 201);
  assert.equal(r.body.app.status, "pending");
  assert.equal((await call(appApi, "PATCH", { token: "tokC", query: { id: "a-404" }, body: { status: "withdrawn" } })).status, 404);
});

test("모집자가 수락하는 순간 신청자가 취소해도 둘 중 하나만 돼요", async () => {
  const call = setup();
  const { c } = await studyWithApps(call);
  const results = await Promise.all([
    call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "accepted" } }),
    call(appApi, "PATCH", { token: "tokC", query: { id: c.id }, body: { status: "withdrawn" } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const st = (await call(stateApi, "GET")).body;
  assert.ok(["accepted", "withdrawn"].includes(st.apps.find((a) => a.id === c.id).status));
});

test("모집자가 취소하는 순간 들어온 신청은 받지 않아요", async () => {
  const call = setup();
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study;
  const [cancel, apply] = await Promise.all([
    call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { canceled: true } }),
    call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } }),
  ]);
  assert.equal(cancel.status, 200);
  // 잠금 순서대로: 신청이 먼저면 대기 신청이 남고(스터디는 취소됨), 취소가 먼저면 신청이 409예요
  if (apply.status === 201) assert.equal(apply.body.app.status, "pending");
  else assert.equal(apply.status, 409);
  const st = (await call(stateApi, "GET")).body;
  assert.equal(st.studies[0].canceled, true);
});

test("스터디를 열 때 진행 시간대를 고를 수 있고, 안 고르면 빈 목록이에요", async () => {
  const call = setup();
  await withPeople(call);
  let r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, times: ["평일 밤", "평일 낮"] } }); // 화·목
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.study.times, ["평일 낮", "평일 밤"]);
  r = await call(studiesApi, "POST", { token: "tokA", body: study });
  assert.deepEqual(r.body.study.times, []);
  r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, times: ["주말 오후"] } });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.times, /요일/);
  r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, times: ["새벽", 3] } });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.times, /목록/);
});

test("신청할 때 고른 가능한 시간대가 모집자 화면(state)에 보여요", async () => {
  const call = setup();
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study; // 화·목
  let r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id, message: "저녁 좋아요", times: ["평일 저녁", "평일 밤"] } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.app.times, ["평일 저녁", "평일 밤"]);
  r = await call(appsApi, "POST", { token: "tokC", body: { studyId: s.id } });
  assert.deepEqual(r.body.app.times, []);
  const st = (await call(stateApi, "GET")).body;
  assert.deepEqual(st.apps.map((a) => a.times), [["평일 저녁", "평일 밤"], []]);
});

test("신청 시간대가 목록에 없거나 요일에 맞지 않으면 400이고 신청이 남지 않아요", async () => {
  const call = setup();
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study; // 화·목
  let r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id, times: ["주말 오전"] } });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.times, /요일/);
  r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id, times: "평일 밤" } });
  assert.equal(r.status, 400);
  assert.deepEqual((await call(stateApi, "GET")).body.apps, []);
});

const later = (n) => kstToday(Date.now() + n * 86400000); // 한국 날짜로 n일 뒤

test("스터디 일정(모집 마감일·시작일·종료일)은 선택이고, 틀리면 400이에요", async () => {
  const call = setup();
  await withPeople(call);
  let r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, deadline: later(3), startDate: later(5), endDate: later(40) } });
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.study.deadline, r.body.study.startDate, r.body.study.endDate], [later(3), later(5), later(40)]);
  r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, deadline: "", startDate: "" } });
  assert.deepEqual([r.body.study.deadline, r.body.study.startDate, r.body.study.endDate], [null, null, null]);
  r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, deadline: later(-1) } });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.deadline, /오늘/);
  r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, startDate: later(10), endDate: later(5) } });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.endDate, /시작일/);
  r = await call(studiesApi, "POST", { token: "tokA", body: { ...study, deadline: "내일" } });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.deadline, /날짜/);
});

test("모집 마감일이 지난 스터디는 신청을 409로 막고, 모집자가 다시 열면 지난 마감일이 지워져요", async () => {
  const call = setup();
  await withPeople(call);
  const s = (await call(studiesApi, "POST", { token: "tokA", body: { ...study, deadline: later(2) } })).body.study;
  await call.store.put("studies", { ...s, deadline: later(-1) }); // 마감일이 지난 것처럼
  let r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /마감일/);
  r = await call(studyApi, "PATCH", { token: "tokB", query: { id: s.id }, body: { closed: false } });
  assert.equal(r.status, 403);
  r = await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { closed: false } });
  assert.equal(r.status, 200);
  assert.equal(r.body.study.deadline, null);
  assert.equal(r.body.study.closed, false);
  r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } });
  assert.equal(r.status, 201);
});

test("로그인하지 않으면 나가기·내보내기를 401로 막아요", async () => {
  const call = setup();
  assert.equal((await call(appApi, "PATCH", { query: { id: "a-1" }, body: { status: "left" } })).status, 401);
  assert.equal((await call(appApi, "PATCH", { query: { id: "a-1" }, body: { status: "removed" } })).status, 401);
});

test("수락된 사람은 스스로 나갈 수 있고, 다른 사람은 대신 나가게 할 수 없어요", async () => {
  const call = setup();
  const { s, b, c } = await studyWithApps(call); // B 수락, C 대기
  let r = await call(appApi, "PATCH", { token: "tokC", query: { id: b.id }, body: { status: "left" } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /본인만/);
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: b.id }, body: { status: "left" } }); // 모집자도 안 돼요
  assert.equal(r.status, 403);
  r = await call(appApi, "PATCH", { token: "tokC", query: { id: c.id }, body: { status: "left" } }); // 대기 중이면 나가기가 아니라 신청 취소
  assert.equal(r.status, 409);
  r = await call(appApi, "PATCH", { token: "tokB", query: { id: b.id }, body: { status: "left" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.app.status, "left");
  const st = (await call(stateApi, "GET")).body;
  assert.equal(st.apps.find((a) => a.id === b.id).status, "left");
  r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } }); // 마음이 바뀌면 다시 신청해요
  assert.equal(r.status, 201);
});

test("모집자는 수락된 사람을 내보낼 수 있고, 내보낸 사람은 다시 신청할 수 없어요", async () => {
  const call = setup();
  const { s, b, c } = await studyWithApps(call);
  let r = await call(appApi, "PATCH", { token: "tokC", query: { id: b.id }, body: { status: "removed" } });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /모집자만/);
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "removed" } }); // 대기 중이면 거절을 써요
  assert.equal(r.status, 409);
  r = await call(appApi, "PATCH", { token: "tokA", query: { id: b.id }, body: { status: "removed" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.app.status, "removed");
  r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /내보낸/);
});

test("모집자가 내보내는 순간 본인이 나가도 둘 중 하나만 돼요", async () => {
  const call = setup();
  const { b } = await studyWithApps(call);
  const results = await Promise.all([
    call(appApi, "PATCH", { token: "tokA", query: { id: b.id }, body: { status: "removed" } }),
    call(appApi, "PATCH", { token: "tokB", query: { id: b.id }, body: { status: "left" } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

// ---------- 브라우저 푸시 알림 ----------
const sub = (n, host = "fcm.googleapis.com") => ({ endpoint: "https://" + host + "/send/" + n, keys: { p256dh: "p" + n, auth: "a" + n } });

test("알림 설정: 공개키는 누구나 받고, 구독은 로그인한 나만 저장·삭제해요 (공개 목록에는 안 나와요)", async () => {
  const call = setup();
  let r = await call(pushApi, "GET");
  assert.deepEqual(r.body, { publicKey: "test-public-key", enabled: true });
  assert.equal((await call(pushApi, "POST", { body: { subscription: sub(1) } })).status, 401);
  assert.equal((await call(pushApi, "DELETE", { body: { endpoint: sub(1).endpoint } })).status, 401);
  r = await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(1) } });
  assert.equal(r.status, 200);
  assert.equal(r.body.devices, 1);
  r = await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(1) } }); // 같은 기기는 한 번만
  assert.equal(r.body.devices, 1);
  r = await call(pushApi, "POST", { token: "tokA", body: { subscription: { ...sub(2), expirationTime: null, extra: "x" } } });
  assert.equal(r.body.devices, 2);
  assert.deepEqual(await call.store.getSubs("me-g111"), [sub(1), sub(2)]); // 주소와 키 두 개만 남겨요
  const st = await call(stateApi, "GET");
  assert.ok(!JSON.stringify(st.body).includes("googleapis"));
  r = await call(pushApi, "DELETE", { token: "tokA", body: { endpoint: sub(1).endpoint } });
  assert.equal(r.body.devices, 1);
  assert.deepEqual(await call.store.getSubs("me-g111"), [sub(2)]);
});

test("알림 설정: 브라우저 회사의 푸시 서버 주소만 받아요", async () => {
  const call = setup();
  const bad = [null, {}, { endpoint: "https://fcm.googleapis.com/x" }, sub(1, "evil.example.com"), { ...sub(1), endpoint: "http://fcm.googleapis.com/x" }, sub(1, "fcm.googleapis.com.evil.com"), sub(1, "localhost")];
  for (const s of bad) assert.equal((await call(pushApi, "POST", { token: "tokA", body: { subscription: s } })).status, 400, JSON.stringify(s));
  for (const host of ["web.push.apple.com", "updates.push.services.mozilla.com", "wns2-by3p.notify.windows.com"]) {
    assert.equal((await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(9, host) } })).status, 200, host);
  }
});

test("알림 설정: 기기는 5대까지 저장하고 오래된 것부터 빼요", async () => {
  const call = setup();
  for (let n = 1; n <= 6; n++) await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(n) } });
  assert.deepEqual((await call.store.getSubs("me-g111")).map((x) => x.endpoint), [2, 3, 4, 5, 6].map((n) => sub(n).endpoint));
});

test("알림 키가 없으면 enabled: false이고 구독을 503으로 받지 않아요 (다른 동작은 그대로예요)", async () => {
  const call = setup({ noPush: true });
  assert.deepEqual((await call(pushApi, "GET")).body, { publicKey: null, enabled: false });
  assert.equal((await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(1) } })).status, 503);
  await withPeople(call);
  assert.equal((await call(studiesApi, "POST", { token: "tokA", body: study })).status, 201);
});

test("신청하면 모집자의 기기마다, 수락하면 신청자에게 알림이 가요 (일한 사람 자신에게는 안 가요)", async () => {
  const call = setup();
  await withPeople(call);
  await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(1) } });
  await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(2) } });
  await call(pushApi, "POST", { token: "tokB", body: { subscription: sub(3) } });
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study;
  assert.deepEqual(call.sent, []); // 스터디를 연 것만으로는 안 보내요
  const app = (await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id, message: "같이 해요" } })).body.app;
  assert.deepEqual(call.sent.map((x) => x.endpoint).sort(), [sub(1).endpoint, sub(2).endpoint]);
  assert.match(call.sent[0].title, /새 신청/);
  assert.match(call.sent[0].body, /신청자B님/);
  assert.equal(call.sent[0].url, "/#/s/" + s.id);
  call.sent.length = 0;
  await call(appApi, "PATCH", { token: "tokA", query: { id: app.id }, body: { status: "accepted" } });
  assert.deepEqual(call.sent.map((x) => x.endpoint), [sub(3).endpoint]);
  assert.match(call.sent[0].title, /수락/);
});

test("모집 취소·내보내기·나가기 알림이 받을 사람에게 가요", async () => {
  const call = setup();
  const { s, b, c } = await studyWithApps(call); // A 모집자, B 수락, C 대기
  for (const [tok, n] of [["tokA", 1], ["tokB", 2], ["tokC", 3]]) await call(pushApi, "POST", { token: tok, body: { subscription: sub(n) } });
  await call(appApi, "PATCH", { token: "tokB", query: { id: b.id }, body: { status: "left" } });
  assert.deepEqual(call.sent.map((x) => [x.endpoint, x.title]), [[sub(1).endpoint, "함께하던 사람이 나갔어요"]]);
  call.sent.length = 0;
  await call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "accepted" } });
  call.sent.length = 0;
  await call(appApi, "PATCH", { token: "tokA", query: { id: c.id }, body: { status: "removed" } });
  assert.deepEqual(call.sent.map((x) => x.endpoint), [sub(3).endpoint]);
  call.sent.length = 0;
  const again = (await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } })).body.app; // B가 다시 신청(대기)
  call.sent.length = 0;
  await call(studyApi, "PATCH", { token: "tokA", query: { id: s.id }, body: { canceled: true } });
  assert.deepEqual(call.sent.map((x) => x.endpoint), [sub(2).endpoint]); // 대기 중인 B에게만 (내보내진 C에게는 안 가요)
  assert.ok(again);
});

test("사라진 구독(404·410)은 지우고, 알림이 실패해도 신청은 돼요", async () => {
  const call = setup({
    send: async (s) => {
      const e = new Error(s.endpoint.endsWith("/1") ? "gone" : "network");
      if (s.endpoint.endsWith("/1")) e.statusCode = 410;
      throw e;
    },
  });
  await withPeople(call);
  await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(1) } });
  await call(pushApi, "POST", { token: "tokA", body: { subscription: sub(2) } });
  const s = (await call(studiesApi, "POST", { token: "tokA", body: study })).body.study;
  const r = await call(appsApi, "POST", { token: "tokB", body: { studyId: s.id } });
  assert.equal(r.status, 201);
  assert.deepEqual((await call.store.getSubs("me-g111")).map((x) => x.endpoint), [sub(2).endpoint]); // 410만 지우고, 잠깐의 네트워크 오류는 남겨요
});
