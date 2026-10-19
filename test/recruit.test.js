// npm test: 공지용 스터디 모집 규칙
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../recruit/recruit-logic.js";

const seed = JSON.parse(readFileSync(new URL("../recruit/seed.json", import.meta.url), "utf8"));
const S = (id) => seed.studies.find((s) => s.id === id);

test("예시 스터디는 모두 등록 규칙을 통과해요", () => {
  seed.studies.forEach((s) => assert.deepEqual(R.validateStudy(s), {}, s.id));
});

test("등록 규칙: 주 횟수와 요일 수가 맞아야 하고, 정원은 6명 이내예요", () => {
  const ok = { topic: "t3", title: "NumPy 벡터 연산", perWeek: 2, days: ["화", "목"], mode: "ZEP 온라인", capacity: 6, goal: "반복문을 벡터 연산으로 바꿔 속도 비교" };
  assert.deepEqual(R.validateStudy(ok), {});
  assert.ok(R.validateStudy({ ...ok, days: ["화"] }).days);
  assert.ok(R.validateStudy({ ...ok, capacity: 7 }).capacity);
  assert.ok(R.validateStudy({ ...ok, topic: "" }).topic);
});

test("직군 구성: 모집자와 수락된 사람으로 세고, 없는 직군을 알려 줘요", () => {
  const mix = R.roleMix(S("s1"), seed.apps, seed.people); // 판다스장인(dev) + 데이터궁금이(po), 픽셀정리왕은 대기
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
  // s3 정원 4: 코딩하는고양이 + 판다스장인 → 2자리 남음
  let apps = seed.apps;
  apps = R.decide(S("s3"), R.apply(S("s3"), apps, seed.people, "p2", "a"), seed.people, "a", "accepted");
  apps = R.decide(S("s3"), R.apply(S("s3"), apps, seed.people, "p4", "b"), seed.people, "b", "accepted");
  assert.equal(R.seatsLeft(S("s3"), apps, seed.people), 0);
  assert.throws(() => R.apply(S("s3"), apps, seed.people, "p6", "c"), /정원/);
  assert.throws(() => R.apply(S("s4"), seed.apps, seed.people, "p2", "d"), /마감/);
  assert.throws(() => R.apply(S("s1"), seed.apps, seed.people, "p5", "e"), /내가 연/);
});

test("목록은 모집 중인 스터디가 먼저예요", () => {
  const order = R.sortStudies(seed.studies, seed.apps, seed.people).map((s) => s.id);
  assert.equal(order[order.length - 1], "s4");
});
