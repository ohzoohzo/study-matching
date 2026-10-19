// 스터디 매칭보드 규칙 (기획안 7장). 화면과 테스트가 같이 써요.
// 숫자 계산만으로 끝나요. AI 호출은 쓰지 않아요. 같은 입력이면 항상 같은 결과가 나와요.

export const ROLES = [
  { key: "dev", label: "개발" },
  { key: "design", label: "디자인" },
  { key: "po", label: "PO" },
  { key: "marketing", label: "마케터" },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));
export const DOMAINS = ["헬스케어", "에듀테크", "핀테크", "커머스", "라이프스타일"];
export const TIMES = ["평일 낮", "평일 저녁", "평일 밤", "주말 오전", "주말 오후", "주말 저녁"];
export const OPTIONAL = "선택";

// CSV(matching_test_members.csv) → 사람 목록
export function parseMembersCsv(text) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = lines.shift().split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row = Object.fromEntries(head.map((h, i) => [h, (cells[i] || "").trim()]));
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      domains: [row.domain1, row.domain2, row.domain3].filter(Boolean),
      times: row.times ? row.times.split(";").map((t) => t.trim()).filter(Boolean) : [],
      intro: row.intro,
    };
  });
}

// 프로필 입력 검사 (R1·R2): 틀린 칸마다 이유를 돌려줘요
export function validateMember(m) {
  const errors = {};
  if (!String(m.name || "").trim()) errors.name = "이름을 적어 주세요.";
  if (!ROLE_LABEL[m.role]) errors.role = "역할을 하나 골라 주세요.";
  const d = m.domains || [];
  if (d.length < 1 || d.length > 3) errors.domains = "관심 도메인을 1~3개 골라 주세요.";
  else if (d.some((x) => !DOMAINS.includes(x)) || new Set(d).size !== d.length) errors.domains = "관심 도메인은 목록에서 겹치지 않게 골라 주세요.";
  const t = m.times || [];
  if (t.length < 1) errors.times = "가능한 시간대를 하나 이상 골라 주세요.";
  else if (t.some((x) => !TIMES.includes(x))) errors.times = "시간대는 목록에서 골라 주세요.";
  const intro = String(m.intro || "").trim();
  if (!intro) errors.intro = "한 줄 소개를 적어 주세요.";
  else if (intro.length > 60) errors.intro = "한 줄 소개는 60자 안으로 적어 주세요.";
  return errors;
}

// 정원 계산 (R3·R4): 역할별 인원 N을 팀 수 T로 나눠 몫을 모든 팀에, 나머지만큼 앞 팀부터 1명씩 더 줘요.
// N < T면 앞의 N개 팀에만 1칸, 나머지 팀은 "선택" 칸이에요.
export function slotsForRole(n, t) {
  const base = Math.floor(n / t), extra = n % t;
  return Array.from({ length: t }, (_, i) => {
    const v = base + (i < extra ? 1 : 0);
    return v === 0 ? OPTIONAL : v;
  });
}

export function roleCounts(members) {
  const c = Object.fromEntries(ROLES.map((r) => [r.key, 0]));
  members.forEach((m) => { if (c[m.role] !== undefined) c[m.role] += 1; });
  return c;
}

// 팀 수가 바뀌면 팀을 다시 만들어요. 앞 팀들은 기본 팀(도메인·시간대·팀장)을 그대로 쓰고,
// 기본 팀보다 많으면 1순위 관심 도메인이 많은 순서로 도메인을 돌려 가며 붙여요.
export function buildTeams(baseTeams, members, t) {
  const counts = roleCounts(members);
  const slotTable = Object.fromEntries(ROLES.map((r) => [r.key, slotsForRole(counts[r.key], t)]));
  const popular = DOMAINS.slice().sort((a, b) => members.filter((m) => m.domains[0] === b).length - members.filter((m) => m.domains[0] === a).length || DOMAINS.indexOf(a) - DOMAINS.indexOf(b));
  return Array.from({ length: t }, (_, i) => {
    const base = baseTeams[i];
    const domain = base ? base.domain : popular[i % popular.length];
    return {
      id: "t" + (i + 1),
      number: i + 1,
      domain,
      mainTimes: base ? base.mainTimes.slice() : [],
      leaderId: base ? base.leaderId : null,
      slots: Object.fromEntries(ROLES.map((r) => [r.key, slotTable[r.key][i]])),
    };
  });
}

export function capacity(team, role) {
  const v = team.slots[role];
  return v === OPTIONAL ? 0 : v;
}
export function filled(team, role, apps) {
  return apps.filter((a) => a.teamId === team.id && a.role === role && a.status === "accepted").length;
}
export function openSlots(team, role, apps) {
  return Math.max(0, capacity(team, role) - filled(team, role, apps));
}
export function totalOpen(team, apps) {
  return ROLES.reduce((sum, r) => sum + openSlots(team, r.key, apps), 0);
}
export function teamOf(memberId, apps) {
  const a = apps.find((x) => x.memberId === memberId && x.status === "accepted");
  return a ? a.teamId : null;
}

// 추천 점수 (R7)
export function score(member, team, apps) {
  let s = 0;
  const rank = member.domains.indexOf(team.domain);
  if (rank === 0) s += 3; else if (rank === 1) s += 2; else if (rank === 2) s += 1;
  s += Math.min(3, member.times.filter((t) => team.mainTimes.includes(t)).length);
  const open = openSlots(team, member.role, apps);
  if (open >= 1) s += 3;
  if (open >= 2) s += 1;
  return s;
}

// "나에게 맞는 팀" 상위 3개. 내 역할 칸이 꽉 찬 팀은 빼요.
// 점수가 같으면 빈 칸(모든 역할)이 더 많은 팀, 그다음 팀 번호가 작은 팀이 앞이에요.
export function recommend(member, teams, apps, limit = 3) {
  return teams
    .filter((t) => openSlots(t, member.role, apps) > 0)
    .map((t) => ({ team: t, score: score(member, t, apps), open: totalOpen(t, apps) }))
    .sort((a, b) => b.score - a.score || b.open - a.open || a.team.number - b.team.number)
    .slice(0, limit);
}

// 지원 (R6·R8): 이미 소속된 사람, 내 역할 빈 칸이 없는 팀, 같은 팀에 이미 대기 중인 지원은 막아요.
export function canApply(member, team, apps) {
  if (teamOf(member.id, apps)) return { ok: false, reason: "이미 한 팀에 소속돼서 다른 팀에는 지원할 수 없어요." };
  if (openSlots(team, member.role, apps) === 0) return { ok: false, reason: ROLE_LABEL[member.role] + " 빈 칸이 없어요." };
  if (apps.some((a) => a.memberId === member.id && a.teamId === team.id && a.status === "pending")) return { ok: false, reason: "이 팀에 이미 지원했어요. 팀장의 답을 기다려 주세요." };
  return { ok: true };
}

export function apply(member, team, apps, id) {
  const check = canApply(member, team, apps);
  if (!check.ok) throw new Error(check.reason);
  return apps.concat({ id, memberId: member.id, teamId: team.id, role: member.role, status: "pending" });
}

// 수락: 그 사람의 다른 대기 지원은 자동으로 거절돼요 (한 사람은 한 팀에만, R8)
export function decide(apps, appId, status, teams) {
  const app = apps.find((a) => a.id === appId);
  if (!app || app.status !== "pending") throw new Error("대기 중인 지원만 수락하거나 거절할 수 있어요.");
  if (status === "accepted") {
    const team = teams.find((t) => t.id === app.teamId);
    if (teamOf(app.memberId, apps)) throw new Error("이미 다른 팀에 소속된 사람이에요.");
    if (openSlots(team, app.role, apps) === 0) throw new Error("이 역할의 빈 칸이 다 찼어요.");
    return apps.map((a) => a.id === appId ? { ...a, status: "accepted" }
      : a.memberId === app.memberId && a.status === "pending" ? { ...a, status: "rejected" } : a);
  }
  return apps.map((a) => (a.id === appId ? { ...a, status: "rejected" } : a));
}

// 운영진 자동 배치: 아직 팀이 없는 사람을 번호 순으로, 추천 1순위 팀에 넣어요.
export function autoAssign(members, teams, apps, nextId) {
  let out = apps;
  members.forEach((m) => {
    if (teamOf(m.id, out)) return;
    const top = recommend(m, teams, out, 1)[0];
    if (!top) return;
    out = out.map((a) => (a.memberId === m.id && a.status === "pending" ? { ...a, status: "rejected" } : a))
      .concat({ id: nextId(), memberId: m.id, teamId: top.team.id, role: m.role, status: "accepted" });
  });
  return out;
}

// 팀장은 처음부터 자기 팀에 소속돼 있어요
export function leaderApps(teams, members, nextId) {
  return teams.filter((t) => t.leaderId).map((t) => {
    const m = members.find((x) => x.id === t.leaderId);
    return m ? { id: nextId(), memberId: m.id, teamId: t.id, role: m.role, status: "accepted" } : null;
  }).filter(Boolean);
}
