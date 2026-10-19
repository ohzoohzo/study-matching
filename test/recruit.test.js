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
    { id: "s1", topic: "t4", title: "pandas로 CSV 분석해 보기", days: ["화", "목"], mode: "ZEP 온라인", capacity: 5, goal: "CSV를 읽어 필터·정렬·집계까지 해 보기", leaderId: "p5", closed: false, createdAt: "2026-10-16T09:00" },
    { id: "s2", topic: "", title: "Figma 오토레이아웃 같이 익히기", days: ["수"], mode: "오프라인", capacity: 6, goal: "카드 컴포넌트 하나를 오토레이아웃으로 완성", leaderId: "p2", closed: false, createdAt: "2026-10-16T10:30" },
    { id: "s3", topic: "t7", title: "Flask로 /api/summary 만들기", days: ["월", "금"], mode: "ZEP 온라인", capacity: 4, goal: "분석 결과를 JSON으로 응답하기", leaderId: "p1", closed: false, createdAt: "2026-10-15T20:00" },
    { id: "s4", topic: "t1", title: "파이썬 기초 문법 완주반", days: ["월", "수", "금"], mode: "오프라인", capacity: 3, goal: "매일 작은 문제 하나씩 풀기", leaderId: "p3", closed: true, createdAt: "2026-10-15T18:00" },
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

test("테스트 스터디는 모두 등록 규칙을 통과해요 (주제 없이 연 스터디 포함)", () => {
  seed.studies.forEach((s) => assert.deepEqual(R.validateStudy(s), {}, s.id));
});

test("등록 규칙: 요일은 하나 이상, 권장 주제는 고르지 않아도 되고, 정원은 6명 이내예요", () => {
  const ok = { topic: "t3", title: "NumPy 벡터 연산", days: ["화", "목"], mode: "ZEP 온라인", capacity: 6, goal: "반복문을 벡터 연산으로 바꿔 속도 비교" };
  assert.deepEqual(R.validateStudy(ok), {});
  assert.deepEqual(R.validateStudy({ ...ok, topic: "" }), {});
  assert.ok(R.validateStudy({ ...ok, topic: "free" }).topic);
  assert.ok(R.validateStudy({ ...ok, days: [] }).days);
  assert.ok(R.validateStudy({ ...ok, capacity: 7 }).capacity);
  assert.ok(!R.TOPICS.some((t) => t.key === "free"));
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
