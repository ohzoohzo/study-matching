// npm test: 공지용 스터디 모집 규칙
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../recruit/recruit-logic.js";

// 테스트에서만 쓰는 데이터예요. 사이트는 빈 목록으로 시작해요.
const seed = {
  people: [
    { id: "p1", name: "개발A", role: "dev" },
    { id: "p2", name: "디자인A", role: "design" },
    { id: "p3", name: "PO-A", role: "po" },
    { id: "p4", name: "마케터A", role: "marketing" },
    { id: "p5", name: "개발B", role: "dev" },
    { id: "p6", name: "디자인B", role: "design" },
    { id: "p7", name: "PO-B", role: "po" },
  ],
  studies: [
    { id: "s1", title: "pandas로 CSV 분석해 보기", days: ["화", "목"], mode: "ZEP 온라인", capacity: 5, goal: "CSV를 읽어 필터·정렬·집계까지 해 보기", leaderId: "p5", closed: false, createdAt: "2026-10-16T09:00" },
    { id: "s2", title: "Figma 오토레이아웃 같이 익히기", days: ["수"], mode: "오프라인", capacity: 6, goal: "카드 컴포넌트 하나를 오토레이아웃으로 완성", leaderId: "p2", closed: false, createdAt: "2026-10-16T10:30" },
    { id: "s3", title: "Flask로 /api/summary 만들기", days: ["월", "금"], mode: "ZEP 온라인", capacity: 4, goal: "분석 결과를 JSON으로 응답하기", leaderId: "p1", closed: false, createdAt: "2026-10-15T20:00" },
    { id: "s4", title: "파이썬 기초 문법 완주반", days: ["월", "수", "금"], mode: "오프라인", capacity: 3, goal: "매일 작은 문제 하나씩 풀기", leaderId: "p3", closed: true, createdAt: "2026-10-15T18:00" },
  ],
  apps: [
    { id: "x1", studyId: "s1", personId: "p7", status: "accepted", message: "" },
    { id: "x2", studyId: "s1", personId: "p2", status: "pending", message: "" },
    { id: "x3", studyId: "s2", personId: "p4", status: "accepted", message: "" },
    { id: "x4", studyId: "s2", personId: "p3", status: "accepted", message: "" },
    { id: "x5", studyId: "s3", personId: "p5", status: "accepted", message: "" },
    { id: "x6", studyId: "s4", personId: "p6", status: "accepted", message: "" },
    { id: "x7", studyId: "s4", personId: "p1", status: "accepted", message: "" },
  ],
};
const S = (id) => seed.studies.find((s) => s.id === id);

test("테스트 스터디는 모두 등록 규칙을 통과해요", () => {
  seed.studies.forEach((s) => assert.deepEqual(R.validateStudy(s), {}, s.id));
});

test("등록 규칙: 요일은 하나 이상, 정원은 6명 이내예요 (권장 주제는 없어요)", () => {
  const ok = { title: "NumPy 벡터 연산", days: ["화", "목"], mode: "ZEP 온라인", capacity: 6, goal: "반복문을 벡터 연산으로 바꿔 속도 비교" };
  assert.deepEqual(R.validateStudy(ok), {});
  assert.deepEqual(R.validateStudy({ ...ok, topic: "free" }), {}); // 주제 칸은 보지 않아요
  assert.ok(R.validateStudy({ ...ok, days: [] }).days);
  assert.ok(R.validateStudy({ ...ok, capacity: 7 }).capacity);
  assert.equal(R.TOPICS, undefined);
  assert.equal(R.TOPIC_LABEL, undefined);
});

test("직군 구성: 모집자와 수락된 사람으로 세고, 없는 직군을 알려 줘요", () => {
  const mix = R.roleMix(S("s1"), seed.apps, seed.people); // 개발B(dev) + PO-B(po), 디자인A는 대기
  assert.deepEqual(mix.counts, { dev: 1, design: 0, po: 1, marketing: 0 });
  assert.deepEqual(mix.missing, ["design", "marketing"]);
});

test("신청 → 수락 흐름과 중복 신청 막기", () => {
  let apps = R.apply(S("s3"), seed.apps, seed.people, "p2", "n1", "디자인 맡을게요");
  assert.throws(() => R.apply(S("s3"), apps, seed.people, "p2", "n2"), /기다려/);
  apps = R.decide(S("s3"), apps, seed.people, "n1", "accepted");
  assert.equal(R.myApplication(S("s3"), apps, "p2").status, "accepted");
  assert.throws(() => R.apply(S("s3"), apps, seed.people, "p2", "n3"), /이미 함께/);
});

test("정원이 차거나 마감하면 신청이 막혀요", () => {
  // s3 정원 4: 개발A + 개발B → 2자리 남음
  let apps = seed.apps;
  apps = R.decide(S("s3"), R.apply(S("s3"), apps, seed.people, "p2", "a"), seed.people, "a", "accepted");
  apps = R.decide(S("s3"), R.apply(S("s3"), apps, seed.people, "p4", "b"), seed.people, "b", "accepted");
  assert.equal(R.seatsLeft(S("s3"), apps, seed.people), 0);
  assert.throws(() => R.apply(S("s3"), apps, seed.people, "p6", "c"), /정원/);
  assert.throws(() => R.apply(S("s4"), seed.apps, seed.people, "p2", "d"), /마감/);
  assert.throws(() => R.apply(S("s1"), seed.apps, seed.people, "p5", "e"), /내가 연/);
});

test("수락·거절·마감은 모집자만 할 수 있어요", () => {
  assert.deepEqual(R.canManage(S("s1"), "p5"), { ok: true });
  assert.match(R.canManage(S("s1"), "p2").reason, /모집자만/);
  assert.match(R.canManage(S("s1"), null).reason, /로그인/);
  assert.throws(() => R.closeStudy(S("s1"), "p2"), /모집자만/);
  const closed = R.closeStudy(S("s1"), "p5");
  assert.equal(closed.closed, true);
  assert.equal(S("s1").closed, false); // 원래 스터디는 그대로예요
});

test("다시 신청하면 마지막 신청이 내 신청이에요", () => {
  let apps = R.apply(S("s3"), seed.apps, seed.people, "p2", "r1");
  apps = R.decide(S("s3"), apps, seed.people, "r1", "rejected");
  apps = R.apply(S("s3"), apps, seed.people, "p2", "r2", "한 번 더요");
  assert.equal(R.myApplication(S("s3"), apps, "p2").id, "r2");
});

test("목록은 모집 중인 스터디가 먼저예요", () => {
  const order = R.sortStudies(seed.studies, seed.apps, seed.people).map((s) => s.id);
  assert.equal(order[order.length - 1], "s4");
});

// ---------- 검색 ----------
const ids = (list) => list.map((s) => s.id).sort();
const found = (q) => ids(seed.studies.filter((s) => R.matchesSearch(s, seed.people, q)));

test("검색: 스터디 이름·목표·모집자 이름 글자로 찾아요 (영문 대소문자는 가리지 않아요)", () => {
  assert.deepEqual(found("figma"), ["s2"]); // 이름 "Figma 오토레이아웃…"
  assert.deepEqual(found("JSON"), ["s3"]); // 목표 "분석 결과를 JSON으로…"
  assert.deepEqual(found("개발B"), ["s1"]); // 모집자 이름
  assert.deepEqual(found("분석"), ["s1", "s3"]); // s1은 이름, s3는 목표
});

test("검색: 여러 낱말은 모두 들어 있는 스터디만 찾고, 빈 검색어는 모두 보여 줘요", () => {
  assert.deepEqual(found("CSV 집계"), ["s1"]);
  assert.deepEqual(found("CSV 디자인"), []);
  assert.deepEqual(found("   "), ["s1", "s2", "s3", "s4"]);
  assert.deepEqual(found(""), ["s1", "s2", "s3", "s4"]);
});

test("검색: 모집자가 아닌 함께하는 사람 이름으로는 찾지 않아요", () => {
  assert.deepEqual(found("마케터A"), []); // s2에 수락된 사람
});

test("목록 거르기: 검색은 '모집 중만'·'내 직군이 비어 있는 스터디'와 함께 써요", () => {
  const list = (opt, studies = seed.studies) => R.filterStudies(studies, seed.apps, seed.people, opt).map((s) => s.id);
  assert.deepEqual(list({ q: "분석" }).sort(), ["s1", "s3"]);
  assert.deepEqual(list({ q: "분석", openOnly: true }, seed.studies.map((s) => (s.id === "s1" ? { ...s, closed: true } : s))), ["s3"]);
  assert.deepEqual(list({ q: "분석", needRole: "po" }), ["s3"]); // s1에는 PO-B가 있어요
  assert.deepEqual(list({ q: "분석", needRole: "design" }).sort(), ["s1", "s3"]);
  assert.deepEqual(list({ q: "파이썬", openOnly: true }), []); // s4는 마감
  assert.deepEqual(list({}), R.sortStudies(seed.studies, seed.apps, seed.people).map((s) => s.id));
});

// ---------- 모집 취소 ----------
test("모집 취소: 모집자만 할 수 있고, 지우지 않고 '취소됨'으로 남겨요", () => {
  assert.throws(() => R.cancelStudy(S("s1"), "p2", "2026-10-19T18:00"), /모집자만/);
  assert.throws(() => R.cancelStudy(S("s1"), null, "2026-10-19T18:00"), /로그인/);
  const c = R.cancelStudy(S("s1"), "p5", "2026-10-19T18:00");
  assert.equal(c.canceled, true);
  assert.equal(c.canceledAt, "2026-10-19T18:00");
  assert.equal(c.title, S("s1").title);
  assert.equal(S("s1").canceled, undefined); // 원래 스터디는 그대로예요
  assert.throws(() => R.cancelStudy(c, "p5", "2026-10-19T18:01"), /이미 취소/);
});

test("모집 취소: 취소한 스터디는 목록에서 빠지고 신청·수락·마감이 막혀요", () => {
  const c = R.cancelStudy(S("s1"), "p5", "2026-10-19T18:00");
  const studies = seed.studies.map((s) => (s.id === "s1" ? c : s));
  assert.ok(!R.filterStudies(studies, seed.apps, seed.people, {}).some((s) => s.id === "s1"));
  assert.ok(!R.filterStudies(studies, seed.apps, seed.people, { q: "pandas" }).length);
  assert.equal(R.isOpen(c, seed.apps, seed.people), false);
  assert.match(R.canApply(c, seed.apps, seed.people, "p4").reason, /취소/);
  assert.throws(() => R.decide(c, seed.apps, seed.people, "x2", "accepted"), /취소/);
  assert.throws(() => R.closeStudy(c, "p5"), /취소/);
});

test("모집 취소: 이미 수락된 사람의 기록은 남아서 '취소됨'을 볼 수 있어요", () => {
  const c = R.cancelStudy(S("s1"), "p5", "2026-10-19T18:00");
  assert.equal(R.myApplication(c, seed.apps, "p7").status, "accepted");
  assert.deepEqual(R.members(c, seed.apps, seed.people).map((p) => p.id), ["p5", "p7"]);
  assert.equal(R.studyStatus(c, seed.apps, seed.people), "canceled");
});

// ---------- 다시 열기 ----------
test("다시 열기: 모집자가 마감한 스터디를 다시 열면 신청을 받아요", () => {
  const closed = R.closeStudy(S("s1"), "p5");
  assert.throws(() => R.reopenStudy(closed, seed.apps, seed.people, "p2"), /모집자만/);
  const again = R.reopenStudy(closed, seed.apps, seed.people, "p5");
  assert.equal(again.closed, false);
  assert.equal(R.isOpen(again, seed.apps, seed.people), true);
  assert.deepEqual(R.canApply(again, seed.apps, seed.people, "p4"), { ok: true });
});

test("다시 열기: 마감하지 않았거나, 정원이 찼거나, 취소한 스터디는 다시 열 수 없어요", () => {
  assert.throws(() => R.reopenStudy(S("s1"), seed.apps, seed.people, "p5"), /마감한 스터디만/);
  assert.throws(() => R.reopenStudy(S("s4"), seed.apps, seed.people, "p3"), /정원/); // s4는 3/3명
  const c = R.cancelStudy(R.closeStudy(S("s1"), "p5"), "p5", "2026-10-19T18:00");
  assert.throws(() => R.reopenStudy(c, seed.apps, seed.people, "p5"), /취소/);
});

test("마감은 한 번만 해요", () => {
  assert.throws(() => R.closeStudy(S("s4"), "p3"), /이미 마감/);
});

// ---------- 신청 취소 ----------
test("신청 취소: 신청자가 대기 중인 신청을 취소하면 withdrawn으로 남고 다시 신청할 수 있어요", () => {
  const apps = R.withdraw(S("s1"), seed.apps, "p2", "x2"); // 디자인A의 대기 신청
  assert.equal(apps.find((a) => a.id === "x2").status, "withdrawn");
  assert.equal(seed.apps.find((a) => a.id === "x2").status, "pending"); // 원래 목록은 그대로예요
  assert.equal(R.myApplication(S("s1"), apps, "p2").status, "withdrawn");
  assert.deepEqual(R.canApply(S("s1"), apps, seed.people, "p2"), { ok: true });
  assert.equal(R.myApplication(S("s1"), R.apply(S("s1"), apps, seed.people, "p2", "y1"), "p2").status, "pending");
  assert.throws(() => R.decide(S("s1"), apps, seed.people, "x2", "accepted"), /대기 중인 신청만/);
});

test("신청 취소: 내 신청만, 대기 중일 때만, 취소되지 않은 스터디에서만 취소할 수 있어요", () => {
  assert.throws(() => R.withdraw(S("s1"), seed.apps, "p5", "x2"), /내 신청만/); // 모집자도 못 해요
  assert.throws(() => R.withdraw(S("s1"), seed.apps, null, "x2"), /로그인/);
  assert.throws(() => R.withdraw(S("s1"), seed.apps, "p7", "x1"), /대기 중인 신청만/); // 이미 수락
  assert.throws(() => R.withdraw(S("s2"), seed.apps, "p2", "x2"), /찾는 신청이 없어요/); // 다른 스터디의 신청
  const c = R.cancelStudy(S("s1"), "p5", "2026-10-19T18:00");
  assert.throws(() => R.withdraw(c, seed.apps, "p2", "x2"), /취소/);
});

// ---------- 상태 ----------
test("스터디 상태: 모집 중 · 정원 마감 · 마감 · 취소됨", () => {
  assert.equal(R.studyStatus(S("s1"), seed.apps, seed.people), "open");
  assert.equal(R.studyStatus(S("s4"), seed.apps, seed.people), "closed");
  const full = { ...S("s3"), capacity: 2 }; // 개발A + 개발B
  assert.equal(R.studyStatus(full, seed.apps, seed.people), "full");
  assert.equal(R.studyStatus({ ...S("s4"), canceled: true }, seed.apps, seed.people), "canceled");
});

test("모집 취소: 함께하기로 했던 사람에게도 '취소한 스터디'라는 이유가 먼저 보여요", () => {
  const c = R.cancelStudy(S("s1"), "p5", "2026-10-19T18:00");
  assert.match(R.canApply(c, seed.apps, seed.people, "p7").reason, /취소/); // 수락된 PO-B
  assert.match(R.canApply(c, seed.apps, seed.people, "p2").reason, /취소/); // 대기 중인 디자인A
});

test("목록 정렬: 취소한 스터디는 마감한 스터디보다도 뒤예요 (내 스터디에서 써요)", () => {
  const studies = seed.studies.map((s) => (s.id === "s2" ? R.cancelStudy(s, "p2", "2026-10-19T18:00") : s)); // s2가 가장 최근
  const order = R.sortStudies(studies, seed.apps, seed.people).map((s) => s.id);
  assert.deepEqual(order.slice(-2), ["s4", "s2"]);
});
