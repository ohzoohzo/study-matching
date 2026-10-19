// npm test: 기획안 7장 규칙과 평가 체크리스트를 숫자로 확인해요
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "../logic.js";

const members = L.parseMembersCsv(readFileSync(new URL("../data/matching_test_members.csv", import.meta.url), "utf8"));
const base = JSON.parse(readFileSync(new URL("../data/teams.json", import.meta.url), "utf8")).teams;
let n = 0; const nextId = () => "a" + (++n);

test("테스트 데이터 40명이 모두 프로필 규칙(R1·R2)을 통과해요", () => {
  assert.equal(members.length, 40);
  members.forEach((m) => assert.deepEqual(L.validateMember(m), {}, m.id));
  assert.deepEqual(L.roleCounts(members), { dev: 15, design: 11, po: 10, marketing: 4 });
});

test("팀 수 6이면 정원표가 기획안 7장 예시와 같아요 (R3·R4)", () => {
  const teams = L.buildTeams(base, members, 6);
  const table = Object.fromEntries(L.ROLES.map((r) => [r.key, teams.map((t) => t.slots[r.key])]));
  assert.deepEqual(table, {
    dev: [3, 3, 3, 2, 2, 2],
    design: [2, 2, 2, 2, 2, 1],
    po: [2, 2, 2, 2, 1, 1],
    marketing: [1, 1, 1, 1, "선택", "선택"],
  });
});

test("팀 수를 바꿔도 같은 규칙이에요", () => {
  assert.deepEqual(L.slotsForRole(15, 4), [4, 4, 4, 3]);
  assert.deepEqual(L.slotsForRole(4, 8), [1, 1, 1, 1, "선택", "선택", "선택", "선택"]);
});

test("추천 점수가 7장 규칙대로 계산돼요 (R7)", () => {
  const teams = L.buildTeams(base, members, 6);
  const m = members.find((x) => x.id === "m01"); // design · 커머스, 핀테크 · 주말 오전, 주말 저녁
  const t4 = teams.find((t) => t.number === 4);  // 커머스 · 주말 오전, 주말 저녁 · 디자인 2칸
  // 1순위 +3, 시간대 2개 +2, 빈 칸 +3, 2칸 이상 +1
  assert.equal(L.score(m, t4, []), 9);
  const top = L.recommend(m, teams, []);
  assert.equal(top.length, 3);
  assert.equal(top[0].team.number, 4);
  assert.deepEqual(L.recommend(m, teams, []).map((x) => x.team.number), top.map((x) => x.team.number), "같은 입력, 같은 순위");
});

test("내 역할 칸이 꽉 찬 팀은 추천에서 빠져요", () => {
  const teams = L.buildTeams(base, members, 6);
  const t6 = teams[5]; // 디자인 1칸
  const apps = [{ id: "x", memberId: "m04", teamId: t6.id, role: "design", status: "accepted" }];
  const m = members.find((x) => x.id === "m01");
  assert.ok(!L.recommend(m, teams, apps, 6).some((r) => r.team.id === t6.id));
});

test("수락되면 다른 팀 지원이 막히고, 다른 대기 지원은 거절돼요 (R6·R8)", () => {
  const teams = L.buildTeams(base, members, 6);
  const m = members.find((x) => x.id === "m01");
  let apps = L.apply(m, teams[0], [], "p1");
  apps = L.apply(m, teams[3], apps, "p2");
  assert.equal(apps.filter((a) => a.status === "pending").length, 2);
  apps = L.decide(apps, "p2", "accepted", teams);
  assert.equal(apps.find((a) => a.id === "p2").status, "accepted");
  assert.equal(apps.find((a) => a.id === "p1").status, "rejected");
  assert.throws(() => L.apply(m, teams[1], apps, "p3"), /이미 한 팀/);
});

test("확정 후 개발자가 한 팀에 4명 이상 몰리지 않아요", () => {
  const teams = L.buildTeams(base, members, 6);
  let apps = L.leaderApps(teams, members, nextId);
  apps = L.autoAssign(members, teams, apps, nextId);
  const devPerTeam = teams.map((t) => L.filled(t, "dev", apps));
  assert.ok(Math.max(...devPerTeam) <= 3, devPerTeam.join(","));
  members.forEach((m) => assert.ok(apps.filter((a) => a.memberId === m.id && a.status === "accepted").length <= 1));
  assert.equal(members.filter((m) => !L.teamOf(m.id, apps)).length, 0, "40명 모두 배치");
});
