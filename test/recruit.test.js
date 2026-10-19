// npm test: 공지용 스터디 모집 규칙
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../recruit/recruit-logic.js";
import * as V1 from "../v1/logic.js";

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

// ---------- 시간대 ----------

test("시간대 목록은 기획안 버전(v1)의 6개와 같아요", () => {
  assert.deepEqual(R.TIMES, V1.TIMES);
});

test("시간대: 고른 요일에 맞는 시간대만 골라요 (평일 → 평일 낮·저녁·밤, 주말 → 주말 오전·오후·저녁)", () => {
  assert.deepEqual(R.timesForDays(["화", "목"]), ["평일 낮", "평일 저녁", "평일 밤"]);
  assert.deepEqual(R.timesForDays(["토"]), ["주말 오전", "주말 오후", "주말 저녁"]);
  assert.deepEqual(R.timesForDays(["금", "일"]), R.TIMES);
  assert.deepEqual(R.timesForDays([]), []);
});

test("스터디 진행 시간대는 안 골라도 되고, 고르면 목록에 있고 요일에 맞아야 해요", () => {
  const ok = { title: "NumPy 벡터 연산", days: ["화", "목"], mode: "ZEP 온라인", capacity: 4, goal: "반복문을 벡터 연산으로 바꿔 속도 비교" };
  assert.deepEqual(R.validateStudy(ok), {}); // 안 고르면 "시간은 모인 뒤 정해요"
  assert.deepEqual(R.validateStudy({ ...ok, times: [] }), {});
  assert.deepEqual(R.validateStudy({ ...ok, times: ["평일 밤", "평일 저녁"] }), {});
  assert.match(R.validateStudy({ ...ok, times: ["새벽"] }).times, /목록/);
  assert.match(R.validateStudy({ ...ok, times: ["주말 오후"] }).times, /요일/); // 화·목인데 주말
  assert.match(R.validateStudy({ ...ok, times: "평일 밤" }).times, /목록/);
});

test("신청할 때 내가 가능한 시간대를 고를 수 있어요 (안 골라도 돼요)", () => {
  let apps = R.apply(S("s3"), seed.apps, seed.people, "p2", "t1", "", ["평일 밤", "평일 낮", "평일 밤"]); // s3는 월·금
  assert.deepEqual(apps.find((a) => a.id === "t1").times, ["평일 낮", "평일 밤"]); // 목록 순서, 중복 없이
  apps = R.apply(S("s3"), seed.apps, seed.people, "p4", "t2");
  assert.deepEqual(apps.find((a) => a.id === "t2").times, []);
  assert.throws(() => R.apply(S("s3"), seed.apps, seed.people, "p6", "t3", "", ["주말 오후"]), /요일/);
  assert.throws(() => R.apply(S("s3"), seed.apps, seed.people, "p6", "t4", "", ["새벽"]), /목록/);
});

test("겹침 요약: 수락된 사람과 대기 중인 사람이 시간대마다 몇 명인지 세요 (거절·신청 취소는 빼요)", () => {
  const st = { ...S("s1"), id: "z", capacity: 6 }; // 화·목 → 평일 시간대만
  const apps = [
    { id: "q1", studyId: "z", personId: "p1", status: "accepted", times: ["평일 밤", "평일 저녁"] },
    { id: "q2", studyId: "z", personId: "p2", status: "accepted", times: ["평일 밤"] },
    { id: "q3", studyId: "z", personId: "p3", status: "pending", times: ["평일 밤", "평일 낮"] },
    { id: "q4", studyId: "z", personId: "p4", status: "rejected", times: ["평일 낮"] },
    { id: "q5", studyId: "z", personId: "p6", status: "withdrawn", times: ["평일 낮"] },
    { id: "q6", studyId: "z", personId: "p7", status: "accepted" }, // 예전 신청: times 없음
    { id: "q7", studyId: "s2", personId: "p1", status: "accepted", times: ["평일 낮"] }, // 다른 스터디
  ];
  assert.deepEqual(R.timeSummary(st, apps), [
    { time: "평일 낮", accepted: 0, pending: 1 },
    { time: "평일 저녁", accepted: 1, pending: 0 },
    { time: "평일 밤", accepted: 2, pending: 1 },
  ]);
  assert.deepEqual(R.timeSummary({ ...st, days: [] }, apps), []);
});

// ---------- 일정: 모집 마감일·스터디 시작일·종료일 (모두 선택) ----------
const TODAY = "2026-10-19";
const base = { title: "NumPy 벡터 연산", days: ["화", "목"], mode: "ZEP 온라인", capacity: 4, goal: "반복문을 벡터 연산으로 바꿔 속도 비교" };
const v = (dates, today = TODAY) => R.validateStudy({ ...base, ...dates }, today);

test("kstToday: 한국 시간 기준 오늘 날짜예요", () => {
  assert.equal(R.kstToday(Date.UTC(2026, 9, 19, 14, 59)), "2026-10-19"); // 한국 23:59
  assert.equal(R.kstToday(Date.UTC(2026, 9, 19, 15, 0)), "2026-10-20"); // 한국 00:00
});

test("일정은 모두 선택 칸이고, 고르면 날짜 모양이 맞아야 해요", () => {
  assert.deepEqual(v({}), {});
  assert.deepEqual(v({ deadline: "", startDate: null, endDate: undefined }), {});
  assert.deepEqual(v({ deadline: "2026-10-25", startDate: "2026-10-27", endDate: "2026-11-30" }), {});
  assert.match(v({ deadline: "10/25" }).deadline, /날짜/);
  assert.match(v({ startDate: "2026-02-30" }).startDate, /날짜/);
  assert.match(v({ endDate: 20261130 }).endDate, /날짜/);
});

test("일정 순서: 시작일 ≤ 종료일, 모집 마감일 ≤ 종료일, 마감일·종료일은 오늘이거나 뒤예요", () => {
  assert.match(v({ startDate: "2026-11-02", endDate: "2026-11-01" }).endDate, /시작일/);
  assert.match(v({ deadline: "2026-12-01", endDate: "2026-11-30" }).deadline, /종료일/);
  assert.match(v({ deadline: "2026-10-18" }).deadline, /오늘/);
  assert.match(v({ endDate: "2026-10-18" }).endDate, /오늘/);
  assert.deepEqual(v({ deadline: "2026-10-19", startDate: "2026-10-01" }), {}); // 오늘 마감, 이미 시작한 스터디도 돼요
  assert.deepEqual(v({ deadline: "2026-10-30", startDate: "2026-10-20" }), {}); // 시작한 뒤에도 모을 수 있어요
  assert.deepEqual(R.validateStudy({ ...base, deadline: "2000-01-01" }), {}); // 오늘을 안 주면(저장된 스터디 확인) 지난 날짜는 보지 않아요
});

test("마감까지 남은 날(D-day)", () => {
  assert.equal(R.daysLeft({ deadline: "2026-10-22" }, TODAY), 3);
  assert.equal(R.daysLeft({ deadline: "2026-10-19" }, TODAY), 0);
  assert.equal(R.daysLeft({ deadline: "2026-10-18" }, TODAY), -1);
  assert.equal(R.daysLeft({ deadline: "2026-11-01" }, "2026-10-31"), 1); // 달이 바뀌어도
  assert.equal(R.daysLeft({}, TODAY), null);
});

test("모집 마감일이 지나면 신청을 받지 않고 '마감'으로 보여요 (마감일 당일까지는 받아요)", () => {
  const d = { ...S("s1"), deadline: "2026-10-20" };
  assert.equal(R.isOpen(d, seed.apps, seed.people, "2026-10-20"), true);
  assert.equal(R.isOpen(d, seed.apps, seed.people, "2026-10-21"), false);
  assert.equal(R.studyStatus(d, seed.apps, seed.people, "2026-10-21"), "closed");
  assert.deepEqual(R.canApply(d, seed.apps, seed.people, "p4", "2026-10-20"), { ok: true });
  assert.match(R.canApply(d, seed.apps, seed.people, "p4", "2026-10-21").reason, /마감일/);
  assert.throws(() => R.apply(d, seed.apps, seed.people, "p4", "n1", "", [], "2026-10-21"), /마감일/);
  assert.deepEqual(R.filterStudies([d], seed.apps, seed.people, { openOnly: true, today: "2026-10-21" }), []);
  assert.equal(R.filterStudies([d], seed.apps, seed.people, { openOnly: true, today: "2026-10-20" }).length, 1);
  // 대기 중인 신청은 마감일이 지나도 수락할 수 있어요
  assert.equal(R.decide(d, seed.apps, seed.people, "x2", "accepted").find((a) => a.id === "x2").status, "accepted");
});

test("다시 열기: 모집 마감일이 지나 마감된 스터디는 지난 마감일을 지우고 다시 열어요", () => {
  const d = { ...S("s1"), deadline: "2026-10-18" };
  assert.throws(() => R.reopenStudy(d, seed.apps, seed.people, "p2", TODAY), /모집자만/);
  const again = R.reopenStudy(d, seed.apps, seed.people, "p5", TODAY);
  assert.equal(again.deadline, null);
  assert.equal(again.closed, false);
  assert.equal(R.isOpen(again, seed.apps, seed.people, TODAY), true);
  // 마감일이 남은 열린 스터디는 다시 열 게 없어요. 직접 마감했다가 다시 열면 남은 마감일은 그대로예요
  const future = { ...S("s1"), deadline: "2026-10-30" };
  assert.throws(() => R.reopenStudy(future, seed.apps, seed.people, "p5", TODAY), /마감한 스터디만/);
  assert.equal(R.reopenStudy({ ...future, closed: true }, seed.apps, seed.people, "p5", TODAY).deadline, "2026-10-30");
});

// ---------- 스스로 나가기 · 내보내기 ----------
test("스스로 나가기: 수락된 본인이 나가면 'left'로 남고, 자리가 비고, 다시 신청할 수 있어요", () => {
  const apps = R.leave(S("s1"), seed.apps, "p7", "x1"); // PO-B는 s1에 수락됨
  assert.equal(apps.find((a) => a.id === "x1").status, "left");
  assert.equal(seed.apps.find((a) => a.id === "x1").status, "accepted"); // 원래 목록은 그대로예요
  assert.deepEqual(R.members(S("s1"), apps, seed.people).map((p) => p.id), ["p5"]);
  assert.equal(R.seatsLeft(S("s1"), apps, seed.people), R.seatsLeft(S("s1"), seed.apps, seed.people) + 1);
  assert.deepEqual(R.canApply(S("s1"), apps, seed.people, "p7"), { ok: true });
});

test("스스로 나가기: 본인만, 수락된 신청만, 취소되지 않은 스터디에서만 돼요", () => {
  assert.throws(() => R.leave(S("s1"), seed.apps, "p5", "x1"), /본인만/); // 모집자도 남을 나가게 할 수 없어요
  assert.throws(() => R.leave(S("s1"), seed.apps, null, "x1"), /로그인/);
  assert.throws(() => R.leave(S("s1"), seed.apps, "p2", "x2"), /함께하는 스터디에서만/); // 대기 중
  assert.throws(() => R.leave(S("s2"), seed.apps, "p7", "x1"), /찾는 신청이 없어요/); // 다른 스터디의 신청
  const c = R.cancelStudy(S("s1"), "p5", "2026-10-19T18:00");
  assert.throws(() => R.leave(c, seed.apps, "p7", "x1"), /취소/);
});

test("내보내기: 모집자가 수락된 사람을 내보내면 'removed'로 남고, 그 사람은 다시 신청할 수 없어요", () => {
  const apps = R.removeMember(S("s1"), seed.apps, "p5", "x1");
  assert.equal(apps.find((a) => a.id === "x1").status, "removed");
  assert.deepEqual(R.members(S("s1"), apps, seed.people).map((p) => p.id), ["p5"]);
  assert.match(R.canApply(S("s1"), apps, seed.people, "p7").reason, /내보낸/);
  assert.throws(() => R.apply(S("s1"), apps, seed.people, "p7", "n9"), /내보낸/);
});

test("내보내기: 모집자만, 함께하는 사람만, 취소되지 않은 스터디에서만 돼요", () => {
  assert.throws(() => R.removeMember(S("s1"), seed.apps, "p7", "x1"), /모집자만/);
  assert.throws(() => R.removeMember(S("s1"), seed.apps, "p5", "x2"), /함께하는 사람만/); // 대기 중
  assert.throws(() => R.removeMember(S("s1"), seed.apps, "p5", "zz"), /찾는 신청이 없어요/);
  const c = R.cancelStudy(S("s1"), "p5", "2026-10-19T18:00");
  assert.throws(() => R.removeMember(c, seed.apps, "p5", "x1"), /취소/);
});

test("정원이 찼던 스터디에서 한 명이 빠지면 다시 모집 중이 돼요 (직접 마감한 스터디는 그대로 마감)", () => {
  const full = { ...S("s3"), capacity: 2 }; // 개발A + 개발B
  assert.equal(R.studyStatus(full, seed.apps, seed.people), "full");
  const apps = R.leave(full, seed.apps, "p5", "x5");
  assert.equal(R.studyStatus(full, apps, seed.people), "open");
  assert.equal(R.studyStatus({ ...full, closed: true }, R.removeMember(full, seed.apps, "p1", "x5"), seed.people), "closed");
});

// ---------- 푸시 알림 문구: 누구에게 무엇을 보낼지 ----------
const push = (kind, appId, study = S("s1"), apps = seed.apps) =>
  R.pushMessages(kind, { study, app: apps.find((a) => a.id === appId), apps, people: seed.people });

test("알림: 신청·신청 취소·나가기는 모집자에게 가요", () => {
  for (const [kind, word] of [["applied", "신청했어요"], ["withdrawn", "취소했어요"], ["left", "나갔어요"]]) {
    const [m, ...rest] = push(kind, "x2"); // 디자인A → s1 모집자 개발B(p5)
    assert.equal(rest.length, 0, kind);
    assert.equal(m.personId, "p5", kind);
    assert.match(m.body, /디자인A님/, kind);
    assert.match(m.body, new RegExp(word), kind);
    assert.match(m.body, /pandas로 CSV 분석해 보기/, kind);
    assert.equal(m.url, "/#/s/s1");
  }
});

test("알림: 수락·거절·내보내기는 그 신청자에게 가요", () => {
  for (const [kind, word] of [["accepted", "수락"], ["rejected", "거절"], ["removed", "내보냈어요"]]) {
    const msgs = push(kind, "x2");
    assert.deepEqual(msgs.map((m) => m.personId), ["p2"], kind);
    assert.match(msgs[0].title + msgs[0].body, new RegExp(word), kind);
  }
});

test("알림: 모집 취소는 수락된 사람과 대기 중인 사람에게만 한 번씩 가요", () => {
  const apps = seed.apps.concat(
    { id: "y1", studyId: "s1", personId: "p3", status: "rejected" },
    { id: "y2", studyId: "s1", personId: "p4", status: "withdrawn" },
    { id: "y3", studyId: "s1", personId: "p2", status: "pending" }, // 같은 사람이 또 있어도 한 번만
  );
  const msgs = R.pushMessages("canceled", { study: S("s1"), apps, people: seed.people });
  assert.deepEqual(msgs.map((m) => m.personId).sort(), ["p2", "p7"]);
  assert.ok(msgs.every((m) => /취소/.test(m.title + m.body)));
});

test("알림: 모르는 일이면 아무에게도 보내지 않아요", () => {
  assert.deepEqual(push("closed", "x2"), []);
});

test("해시태그 다듬기: 앞의 #·＃와 모든 띄어쓰기를 지우고, 대소문자는 그대로 둬요", () => {
  assert.equal(R.normalizeTag("  #프리온보딩 7기 "), "프리온보딩7기");
  assert.equal(R.normalizeTag("＃＃React"), "React");
  assert.equal(R.normalizeTag(null), "");
  assert.equal(R.tagKey("#React"), "react");
});

test("해시태그 정리: 빈 것은 빼고, 대소문자만 다른 중복은 먼저 적은 것만 남겨요", () => {
  assert.deepEqual(R.cleanTags(["React", "#react", " ", "주말", "REACT"]), ["React", "주말"]);
  assert.deepEqual(R.cleanTags(undefined), []);
  assert.deepEqual(R.tagsOf({}), []);
  assert.deepEqual(R.tagsOf({ tags: ["a"] }), ["a"]);
});

test("해시태그 검사: 선택 칸이고, 10개·20자·글자·숫자·_만 돼요", () => {
  assert.equal(R.validateTags(undefined), "");
  assert.equal(R.validateTags(null), "");
  assert.equal(R.validateTags([]), "");
  assert.equal(R.validateTags(["프리온보딩7기", "front_end", "React"]), "");
  assert.equal(R.validateTags(["  #프리온보딩 7기"]), ""); // #과 띄어쓰기는 다듬은 뒤에 봐요
  assert.equal(R.validateTags("7기"), "해시태그를 다시 확인해 주세요.");
  assert.equal(R.validateTags([7]), "해시태그를 다시 확인해 주세요.");
  assert.equal(R.validateTags(Array.from({ length: 11 }, (_, i) => "t" + i)), "해시태그는 10개까지 달 수 있어요.");
  assert.equal(R.validateTags(Array.from({ length: 11 }, () => "같은태그")), ""); // 정리하면 1개
  assert.equal(R.validateTags(["가".repeat(20)]), "");
  assert.equal(R.validateTags(["가".repeat(21)]), "해시태그는 글자·숫자·_로 20자까지 적어 주세요.");
  assert.equal(R.validateTags(["<b>"]), "해시태그는 글자·숫자·_로 20자까지 적어 주세요.");
  assert.equal(R.validateTags(["c++"]), "해시태그는 글자·숫자·_로 20자까지 적어 주세요.");
  assert.equal(R.validateTags(["\u{1F600}"]), "해시태그는 글자·숫자·_로 20자까지 적어 주세요.");
});

test("해시태그 입력 나누기: 쉼표와 #에서 나누고, 띄어쓰기는 지워요 (붙여넣기도 돼요)", () => {
  assert.deepEqual(R.parseTagInput("#a, #b c #d"), ["a", "bc", "d"]);
  assert.deepEqual(R.parseTagInput("프리온보딩 7기"), ["프리온보딩7기"]);
  assert.deepEqual(R.parseTagInput("#프리온보딩7기 #프론트엔드, 주말"), ["프리온보딩7기", "프론트엔드", "주말"]);
  assert.deepEqual(R.parseTagInput(" , # "), []);
});

test("프로필·스터디 검사에 해시태그가 들어가요 (안 달아도 돼요)", () => {
  assert.deepEqual(R.validateProfile({ name: "하늘", role: "dev" }), {});
  assert.deepEqual(R.validateProfile({ name: "하늘", role: "dev", tags: ["7기"] }), {});
  assert.equal(R.validateProfile({ name: "하늘", role: "dev", tags: ["<b>"] }).tags, "해시태그는 글자·숫자·_로 20자까지 적어 주세요.");
  const ok = { title: "NumPy 벡터 연산", days: ["화"], mode: "ZEP 온라인", capacity: 4, goal: "반복문을 벡터 연산으로 바꾸기" };
  assert.deepEqual(R.validateStudy({ ...ok, tags: ["7기"] }), {});
  assert.equal(R.validateStudy({ ...ok, tags: "7기" }).tags, "해시태그를 다시 확인해 주세요.");
});

test("해시태그 검색: #이 붙은 낱말은 스터디 태그에서 일부만 맞아도 찾아요", () => {
  const a = { ...S("s1"), id: "t1", tags: ["프리온보딩7기", "React"] };
  const b = { ...S("s2"), id: "t2", tags: ["프리온보딩17기"] };
  const c = { ...S("s3"), id: "t3" }; // 태그가 없는 예전 스터디
  const hit = (q) => [a, b, c].filter((s) => R.matchesSearch(s, seed.people, q)).map((s) => s.id);
  assert.deepEqual(hit("#프리온보딩7기"), ["t1"]);
  assert.deepEqual(hit("#7기"), ["t1", "t2"]); // 일부 일치라 17기도 나와요
  assert.deepEqual(hit("＃react"), ["t1"]);
  assert.deepEqual(hit("#"), ["t1", "t2", "t3"]); // #만 있으면 무시해요
  assert.deepEqual(hit("#7기 pandas"), ["t1"]); // 낱말은 모두 맞아야 해요
  assert.deepEqual(hit("#pandas"), []); // #이면 이름·목표는 보지 않아요
  assert.deepEqual(hit("온보딩"), ["t1", "t2"]); // #이 없으면 태그도 봐요
});

test("검색어에 태그 넣고 빼기: 칩과 카드 태그가 써요", () => {
  assert.equal(R.toggleTagInQuery("", "프리온보딩7기"), "#프리온보딩7기");
  assert.equal(R.toggleTagInQuery("pandas", "#React"), "pandas #React");
  assert.equal(R.toggleTagInQuery("pandas  #react  csv", "React"), "pandas csv");
  assert.equal(R.tagInQuery("pandas #REACT", "react"), true);
  assert.equal(R.tagInQuery("pandas #React", "Re"), false); // 넣고 빼기는 태그 전체가 같을 때만이에요
  assert.equal(R.tagInQuery("react", "react"), false); // #이 없는 낱말은 태그가 아니에요
});

test("많이 쓰는 태그: 사람과 취소되지 않은 스터디에서 세고, 많은 순·가나다순이에요", () => {
  const people = [{ id: "p1", tags: ["React", "7기"] }, { id: "p2", tags: ["react"] }, { id: "p3" }];
  const studies = [{ id: "s1", tags: ["7기", "주말"] }, { id: "s2", canceled: true, tags: ["취소된태그"] }, { id: "s3" }];
  assert.deepEqual(R.tagSuggestions(people, studies), ["7기", "React", "주말"]);
  assert.deepEqual(R.tagSuggestions(people, studies, { exclude: ["REACT"] }), ["7기", "주말"]);
  assert.deepEqual(R.tagSuggestions(people, studies, { limit: 1 }), ["7기"]);
});
