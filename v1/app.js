// 스터디 매칭보드 화면. 규칙 계산은 logic.js가 하고, 여기서는 그리기와 저장만 해요.
// 데이터는 이 브라우저(localStorage)에만 저장돼요. 처음에는 테스트 데이터 40명과 6팀으로 시작해요.
import * as L from "/v1/logic.js";

const KEY = "study-matching-board:v1";
const ADMIN = "admin";
let S = null;          // { members, baseTeams, teams, apps, teamCount, finalized, seq, me }
const app = document.getElementById("app");

// ---------- 저장 ----------
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장을 막아도 화면은 그대로 동작해요 */ } }
function nextId() { S.seq += 1; return "a" + S.seq; }

async function freshState() {
  const [csv, teamsJson] = await Promise.all([
    fetch("/v1/data/matching_test_members.csv").then((r) => { if (!r.ok) throw new Error("테스트 데이터를 불러오지 못했어요."); return r.text(); }),
    fetch("/v1/data/teams.json").then((r) => { if (!r.ok) throw new Error("팀 데이터를 불러오지 못했어요."); return r.json(); }),
  ]);
  const members = L.parseMembersCsv(csv);
  const base = teamsJson.teams;
  const s = { members, baseTeams: base, teams: [], apps: [], teamCount: base.length, finalized: false, seq: 0, me: ADMIN };
  S = s;
  s.teams = L.buildTeams(base, members, s.teamCount);
  s.apps = L.leaderApps(s.teams, members, nextId);
  return s;
}

async function boot() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    S = saved && saved.members ? saved : await freshState();
  } catch (e) {
    try { S = await freshState(); } catch (err) { return showError(err.message); }
  }
  save();
  renderMe();
  route();
}

// ---------- 도우미 ----------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const member = (id) => S.members.find((m) => m.id === id);
const team = (id) => S.teams.find((t) => t.id === id);
const me = () => (S.me === ADMIN ? null : member(S.me));
const STATUS = { pending: "대기", accepted: "수락", rejected: "거절" };
const ICON = {
  chevron: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>',
  star: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  warn: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  lock: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>',
};

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}
function showError(msg) {
  app.innerHTML = '<div class="sec"><div class="alert" role="alert">' + ICON.warn + '<div><b></b><div><button class="btn btn-outline btn-sm" data-act="reload" style="margin-top:var(--spacing-8)">다시 불러오기</button></div></div></div></div>';
  app.querySelector("b").textContent = msg;
}

function renderMe() {
  const sel = document.getElementById("me");
  const opts = ['<option value="admin">운영진</option>'].concat(
    L.ROLES.map((r) => '<optgroup label="' + r.label + '">' + S.members.filter((m) => m.role === r.key)
      .map((m) => '<option value="' + m.id + '">' + esc(m.name) + (S.teams.some((t) => t.leaderId === m.id) ? " (팀장)" : "") + "</option>").join("") + "</optgroup>"));
  sel.innerHTML = opts.join("");
  sel.value = S.me;
}

// ---------- 화면 공통 ----------
function slotRow(t, role) {
  const cap = t.slots[role.key];
  const f = L.filled(t, role.key, S.apps);
  let pips;
  if (cap === L.OPTIONAL) pips = '<span class="pip opt">선택</span>';
  else pips = Array.from({ length: cap }, (_, i) => '<span class="pip' + (i < f ? " full" : "") + '"></span>').join("");
  const open = L.openSlots(t, role.key, S.apps);
  const need = cap === L.OPTIONAL ? '<span class="need zero">없어도 돼요</span>'
    : open ? '<span class="need">' + open + "칸 비었어요</span>" : '<span class="need zero">다 찼어요</span>';
  return '<li><span class="t-label1">' + role.label + '</span><span class="pips" aria-hidden="true">' + pips + '</span><span class="t-caption1">' + need + "</span></li>";
}

function teamSummary(t) {
  const missing = L.ROLES.filter((r) => L.openSlots(t, r.key, S.apps) > 0).map((r) => r.label + " " + L.openSlots(t, r.key, S.apps) + "칸");
  return missing.length ? "빈 역할: " + missing.join(", ") : "모든 칸이 찼어요";
}

function teamCard(t) {
  const leader = member(t.leaderId);
  return '<li><a class="card team" href="#/team/' + t.id + '" aria-label="' + t.number + "팀 " + esc(t.domain) + ". " + teamSummary(t) + '">' +
    '<div class="head"><span class="t-headline1">' + t.number + '팀</span><span class="tag tag-brand">' + esc(t.domain) + "</span></div>" +
    '<div class="times t-caption1">주요 시간 ' + esc(t.mainTimes.join(" · ") || "미정") + (leader ? " · 팀장 " + esc(leader.name) : "") + "</div>" +
    '<ul class="slots">' + L.ROLES.map((r) => slotRow(t, r)).join("") + "</ul>" +
    '<div class="t-caption1" style="color:var(--fg-2)">' + teamSummary(t) + "</div></a></li>";
}

function legend() {
  return '<div class="legend t-caption1" aria-hidden="true"><span><span class="pip full"></span>찬 칸</span><span><span class="pip"></span>빈 칸</span><span><span class="pip opt">선택</span>인원이 모자라 없어도 되는 칸</span></div>';
}

function finalizedBanner() {
  return S.finalized ? '<div class="banner done t-label1">' + ICON.lock + " 운영진이 편성을 확정했어요. 지원과 수락은 더 할 수 없어요.</div>" : "";
}

// ---------- 매칭보드 메인 ----------
function viewBoard() {
  const m = me();
  let top = "";
  if (m) {
    const mine = L.teamOf(m.id, S.apps);
    if (mine) {
      const t = team(mine);
      top = '<div class="banner done t-label1"><span>' + esc(m.name) + "님은 " + t.number + "팀(" + esc(t.domain) + ")에 소속됐어요.</span><a class=\"more\" href=\"#/team/" + t.id + '">팀 보기' + ICON.chevron + "</a></div>";
    } else {
      const recs = L.recommend(m, S.teams, S.apps);
      top = '<section class="sec" aria-labelledby="rec-title"><div class="sec-head"><h2 id="rec-title" class="t-title3">' + esc(m.name) + "님에게 맞는 팀</h2></div>" +
        (recs.length ? '<ol class="recs">' + recs.map((r, i) => {
          const why = [];
          const rank = m.domains.indexOf(r.team.domain);
          if (rank >= 0) why.push("관심 도메인 " + (rank + 1) + "순위 +" + (3 - rank));
          const overlap = Math.min(3, m.times.filter((x) => r.team.mainTimes.includes(x)).length);
          if (overlap) why.push("시간대 " + overlap + "개 겹침 +" + overlap);
          const open = L.openSlots(r.team, m.role, S.apps);
          why.push(L.ROLE_LABEL[m.role] + " 빈 칸 " + open + "칸 +" + (open >= 2 ? 4 : 3));
          return '<li><a class="card rec" href="#/team/' + r.team.id + '"><div class="head"><span class="t-headline1">' + (i + 1) + "위 · " + r.team.number + "팀 " + esc(r.team.domain) + '</span><span class="pts t-label1">' + r.score + "점</span></div><ul class=\"t-caption1\">" + why.map((w) => "<li>" + w + "</li>").join("") + "</ul></a></li>";
        }).join("") + "</ol>"
          : '<div class="empty">' + L.ROLE_LABEL[m.role] + " 빈 칸이 남은 팀이 없어요. 운영진이 남은 인원을 배치할 거예요.</div>") + "</section>";
    }
  } else {
    top = '<div class="banner t-label1"><span>위에서 "지금 보는 사람"을 고르면 나에게 맞는 팀 3개를 추천해요.</span><a class="more" href="#/profile">프로필 등록' + ICON.chevron + "</a></div>";
  }

  const myApps = m ? S.apps.filter((a) => a.memberId === m.id && !(team(a.teamId) && team(a.teamId).leaderId === m.id && a.status === "accepted")) : [];
  const appsBox = m && myApps.length ? '<section class="sec" aria-labelledby="my-title"><div class="sec-head"><h2 id="my-title" class="t-title3">내 지원 현황</h2></div><ul class="rows card">' +
    myApps.map((a) => { const t = team(a.teamId); return '<li><span>' + t.number + "팀 " + esc(t.domain) + " · " + L.ROLE_LABEL[a.role] + '</span><span class="tag status-' + a.status + '">' + STATUS[a.status] + "</span></li>"; }).join("") + "</ul></section>" : "";

  const domains = [...new Set(S.teams.map((t) => t.domain))]; // 팀 번호 순서대로
  const groups = domains.map((d) => '<div class="domain-group"><h3 class="t-headline1">' + esc(d) + '</h3><ul class="teams">' + S.teams.filter((t) => t.domain === d).map(teamCard).join("") + "</ul></div>").join("");

  return '<header class="page-head"><h1 class="t-title1">매칭보드</h1><p>어느 팀에 어떤 역할이 비어 있는지 한눈에 보고, 빈 칸에 지원해요.</p>' + finalizedBanner() + "</header>" +
    top + appsBox +
    '<section class="sec" aria-labelledby="teams-title"><div class="sec-head"><h2 id="teams-title" class="t-title3">도메인별 팀</h2><span class="t-label1" style="color:var(--fg-3)">' + S.teams.length + "팀 · " + S.members.length + "명</span></div>" + legend() + groups + "</section>";
}

// ---------- 프로필 등록 ----------
let draft = { name: "", role: "", domains: [], times: [], intro: "" };
let draftErrors = {};
function viewProfile() {
  const err = (k) => (draftErrors[k] ? '<p class="err t-caption1" id="err-' + k + '">' + esc(draftErrors[k]) + "</p>" : "");
  const desc = (k, hint) => ' aria-describedby="hint-' + k + (draftErrors[k] ? " err-" + k : "") + '"' + (draftErrors[k] ? ' aria-invalid="true"' : "");
  return '<header class="page-head"><h1 class="t-title1">프로필 등록</h1><p>역할과 관심 도메인, 가능한 시간대를 알려 주면 맞는 팀을 추천해요.</p></header>' +
    (S.finalized ? finalizedBanner() : "") +
    '<form class="form" id="profileForm" novalidate>' +
    '<div class="field"><label for="f-name">이름</label><input id="f-name" class="text" name="name" maxlength="20" value="' + esc(draft.name) + '"' + desc("name") + ' autocomplete="name"><p class="hint t-caption1" id="hint-name">팀 카드와 지원 목록에 보여요.</p>' + err("name") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-role"><span class="label" id="l-role">역할</span><div class="chips">' +
      L.ROLES.map((r) => '<button type="button" class="chip" data-role="' + r.key + '" aria-pressed="' + (draft.role === r.key) + '">' + r.label + "</button>").join("") +
      '</div><p class="hint t-caption1" id="hint-role">하나만 골라요.</p>' + err("role") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-dom"><span class="label" id="l-dom">관심 도메인</span><div class="chips">' +
      L.DOMAINS.map((d) => { const i = draft.domains.indexOf(d); return '<button type="button" class="chip" data-domain="' + d + '" aria-pressed="' + (i >= 0) + '">' + (i >= 0 ? '<span class="rank" aria-hidden="true">' + (i + 1) + "</span>" : "") + d + (i >= 0 ? '<span class="sr">' + (i + 1) + "순위</span>" : "") + "</button>"; }).join("") +
      '</div><p class="hint t-caption1" id="hint-domains">관심 있는 순서대로 1~3개 눌러요. 누른 순서가 1·2·3순위가 돼요.</p>' + err("domains") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-times"><span class="label" id="l-times">가능한 시간대</span><div class="chips">' +
      L.TIMES.map((t) => '<button type="button" class="chip" data-time="' + t + '" aria-pressed="' + draft.times.includes(t) + '">' + t + "</button>").join("") +
      '</div><p class="hint t-caption1" id="hint-times">여러 개 골라도 돼요.</p>' + err("times") + "</div>" +
    '<div class="field"><label for="f-intro">한 줄 소개</label><input id="f-intro" class="text" name="intro" maxlength="60" value="' + esc(draft.intro) + '"' + desc("intro") + '><p class="hint t-caption1" id="hint-intro">60자 안으로 적어요. 예: Figma로 화면 설계 자주 해요</p>' + err("intro") + "</div>" +
    '<div class="actions"><button class="btn btn-primary" type="submit">등록하고 추천 보기</button></div>' +
    "</form>";
}

// ---------- 팀 상세·지원 ----------
function viewTeam(id) {
  const t = team(id);
  if (!t) return '<div class="sec"><div class="empty">찾는 팀이 없어요. 운영진이 팀 수를 바꿨을 수 있어요.<div style="margin-top:var(--spacing-12)"><a class="btn btn-outline btn-sm" href="#/">매칭보드로</a></div></div></div>';
  const m = me();
  const leader = member(t.leaderId);
  const isLeader = (m && m.id === t.leaderId) || S.me === ADMIN;
  const accepted = S.apps.filter((a) => a.teamId === t.id && a.status === "accepted");
  const pending = S.apps.filter((a) => a.teamId === t.id && a.status === "pending");

  const roster = L.ROLES.map((r) => {
    const people = accepted.filter((a) => a.role === r.key).map((a) => member(a.memberId)).filter(Boolean);
    const cap = t.slots[r.key];
    const open = L.openSlots(t, r.key, S.apps);
    let applyBtn = "";
    if (m && m.role === r.key && !S.finalized && open > 0) {
      const can = L.canApply(m, t, S.apps);
      applyBtn = can.ok ? '<button class="btn btn-primary btn-sm" data-act="apply" data-team="' + t.id + '">' + r.label + " 빈 칸에 지원하기</button>"
        : '<span class="t-caption1" style="color:var(--fg-3)">' + esc(can.reason) + "</span>";
    }
    return '<li><div class="who"><b>' + r.label + ' <span class="t-caption1" style="color:var(--fg-3)">' + (cap === L.OPTIONAL ? "선택 칸" : people.length + " / " + cap) + "</span></b><small>" +
      (people.length ? people.map((p) => esc(p.name) + (p.id === t.leaderId ? " (팀장)" : "")).join(", ") : "아직 없어요") + "</small></div>" + applyBtn + "</li>";
  }).join("");

  const myApp = m ? S.apps.filter((a) => a.memberId === m.id && a.teamId === t.id && !(a.status === "accepted" && m.id === t.leaderId)) : [];
  const myStatus = myApp.length ? '<div class="card" style="margin-top:var(--spacing-16)"><b>내 지원 상태</b><ul class="rows">' + myApp.map((a) => '<li><span>' + L.ROLE_LABEL[a.role] + '</span><span class="tag status-' + a.status + '">' + STATUS[a.status] + "</span></li>").join("") + "</ul></div>" : "";

  const review = '<section class="card" aria-labelledby="review-title"><h2 id="review-title" class="t-headline1" style="margin:0 0 var(--spacing-8)">지원자</h2>' +
    (isLeader ? "" : '<p class="t-caption1" style="color:var(--fg-3);margin:0 0 var(--spacing-8)">팀장' + (leader ? "(" + esc(leader.name) + ")" : "") + "이 수락하거나 거절해요.</p>") +
    (pending.length ? '<ul class="rows">' + pending.map((a) => { const p = member(a.memberId); return '<li><div class="who"><b>' + esc(p.name) + " · " + L.ROLE_LABEL[a.role] + "</b><small>" + esc(p.domains.join(", ")) + " · " + esc(p.times.join(", ")) + "<br>" + esc(p.intro) + "</small></div>" +
      (isLeader && !S.finalized ? '<div class="actions"><button class="btn btn-primary btn-sm" data-act="accept" data-app="' + a.id + '">수락</button><button class="btn btn-outline btn-sm" data-act="reject" data-app="' + a.id + '">거절</button></div>' : '<span class="tag status-pending">대기</span>') + "</li>"; }).join("") + "</ul>"
      : '<p class="t-body2" style="color:var(--fg-3);margin:0">대기 중인 지원이 없어요.</p>') + "</section>";

  return '<header class="page-head"><a class="more t-label1" href="#/">매칭보드로</a><h1 class="t-title1" style="margin-top:var(--spacing-8)">' + t.number + "팀 · " + esc(t.domain) + "</h1><p>주요 활동 시간 " + esc(t.mainTimes.join(" · ") || "미정") + (leader ? " · 팀장 " + esc(leader.name) : "") + "</p>" + finalizedBanner() + "</header>" +
    '<div class="two"><section class="card" aria-labelledby="roster-title"><h2 id="roster-title" class="t-headline1" style="margin:0 0 var(--spacing-4)">역할별 멤버와 빈 칸</h2><p class="t-caption1" style="color:var(--fg-2);margin:0">' + teamSummary(t) + '</p><ul class="rows">' + roster + "</ul>" +
    (m ? "" : '<p class="t-caption1" style="color:var(--fg-3);margin:var(--spacing-8) 0 0">지원하려면 위에서 "지금 보는 사람"을 골라요.</p>') + "</section>" +
    "<div>" + review + myStatus + "</div></div>";
}

// ---------- 운영진 관리 ----------
function viewAdmin() {
  const unassigned = S.members.filter((m) => !L.teamOf(m.id, S.apps));
  const table = '<div class="table-wrap"><table class="slot-table t-body2"><caption class="sr">역할별 팀당 정원</caption><thead><tr><th scope="col">역할 (인원)</th>' +
    S.teams.map((t) => '<th scope="col">' + t.number + "팀<br><span class=\"t-caption1\">" + esc(t.domain) + "</span></th>").join("") + "</tr></thead><tbody>" +
    L.ROLES.map((r) => '<tr><th scope="row">' + r.label + " (" + L.roleCounts(S.members)[r.key] + ")</th>" +
      S.teams.map((t) => { const c = t.slots[r.key]; return c === L.OPTIONAL ? '<td class="opt-cell">선택</td>' : "<td>" + L.filled(t, r.key, S.apps) + " / " + c + "</td>"; }).join("") + "</tr>").join("") +
    "</tbody></table></div>";
  const byRole = L.ROLES.map((r) => { const list = unassigned.filter((m) => m.role === r.key); return list.length ? "<li><div class=\"who\"><b>" + r.label + " " + list.length + "명</b><small>" + list.map((m) => esc(m.name)).join(", ") + "</small></div></li>" : ""; }).join("");
  const lock = S.finalized ? " disabled" : "";
  return '<header class="page-head"><h1 class="t-title1">운영진 관리</h1><p>팀 수를 정하면 역할별 정원을 자동으로 계산해요. 남은 인원을 배치하고 편성을 확정해요.</p>' + finalizedBanner() + "</header>" +
    '<section class="sec card" aria-labelledby="count-title" style="padding:var(--spacing-24)"><h2 id="count-title" class="t-headline1" style="margin:0 0 var(--spacing-12)">팀 수</h2>' +
      '<form id="countForm" class="count-row"><div class="field"><label for="f-count" class="t-label1">몇 팀으로 나눌까요?</label><input id="f-count" class="text" type="number" min="1" max="20" value="' + S.teamCount + '"' + lock + '></div><button class="btn btn-primary" type="submit"' + lock + ">정원 계산하기</button></form>" +
      '<p class="t-caption1" style="color:var(--fg-3);margin:var(--spacing-8) 0 0">역할별 인원을 팀 수로 나눠 몫을 모든 팀에, 나머지는 앞 팀부터 1명씩 더 줘요. 인원이 팀 수보다 적은 역할은 뒤 팀이 "선택" 칸이 돼요. 팀 수를 바꾸면 지원 기록이 처음으로 돌아가요.</p></section>' +
    '<section class="sec" aria-labelledby="table-title"><div class="sec-head"><h2 id="table-title" class="t-title3">역할별 팀당 정원</h2><span class="t-label1" style="color:var(--fg-3)">찬 칸 / 정원</span></div>' + table + "</section>" +
    '<section class="sec" aria-labelledby="left-title"><div class="sec-head"><h2 id="left-title" class="t-title3">미배정 인원 ' + unassigned.length + "명</h2>" +
      '<div class="actions"><button class="btn btn-outline btn-sm" data-act="auto"' + (S.finalized || !unassigned.length ? " disabled" : "") + '>남은 인원 자동 배치</button><button class="btn btn-primary btn-sm" data-act="finalize"' + lock + ">편성 확정</button></div></div>" +
      (unassigned.length ? '<ul class="rows card">' + byRole + "</ul>" : '<div class="empty">모든 사람이 팀에 배치됐어요.</div>') +
      '<p class="t-caption1" style="color:var(--fg-3)">자동 배치는 아직 팀이 없는 사람을 번호 순으로, 추천 1위 팀에 넣어요.</p></section>' +
    '<section class="sec"><button class="btn btn-outline btn-sm" data-act="reset">테스트 데이터로 처음부터</button></section>';
}

// ---------- 라우팅 ----------
function route() {
  const hash = location.hash || "#/";
  const [, page, id] = hash.split("/");
  let html, name;
  if (page === "profile") { html = viewProfile(); name = "profile"; }
  else if (page === "admin") { html = viewAdmin(); name = "admin"; }
  else if (page === "team") { html = viewTeam(id); name = "board"; }
  else { html = viewBoard(); name = "board"; }
  app.innerHTML = html;
  document.querySelectorAll(".nav [data-route]").forEach((a) => (a.dataset.route === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  const titles = { profile: "프로필 등록", admin: "운영진 관리", board: page === "team" ? "팀 상세" : "매칭보드" };
  document.title = titles[name] + " · 스터디 매칭보드";
}
function rerender(focusSel) {
  const y = scrollY; route(); scrollTo(0, y);
  if (focusSel) { const el = app.querySelector(focusSel); if (el) el.focus(); }
}

// ---------- 동작 ----------
window.addEventListener("hashchange", () => { route(); app.focus({ preventScroll: true }); scrollTo(0, 0); });
document.getElementById("me").addEventListener("change", (e) => { S.me = e.target.value; save(); route(); toast(S.me === ADMIN ? "운영진으로 보고 있어요." : member(S.me).name + "님으로 보고 있어요."); });

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.act === "reload") { boot(); return; }
    if (b.dataset.role) { draft.role = b.dataset.role; rerender('[data-role="' + b.dataset.role + '"]'); return; }
    if (b.dataset.domain) {
      const d = b.dataset.domain, i = draft.domains.indexOf(d);
      if (i >= 0) draft.domains.splice(i, 1); else if (draft.domains.length < 3) draft.domains.push(d); else toast("관심 도메인은 3개까지 고를 수 있어요.");
      rerender('[data-domain="' + d + '"]'); return;
    }
    if (b.dataset.time) { const t = b.dataset.time, i = draft.times.indexOf(t); if (i >= 0) draft.times.splice(i, 1); else draft.times.push(t); rerender('[data-time="' + t + '"]'); return; }
    if (b.dataset.act === "apply") {
      const t = team(b.dataset.team);
      S.apps = L.apply(me(), t, S.apps, nextId()); save(); rerender();
      toast(t.number + "팀에 지원했어요. 팀장이 수락하면 알려 드려요."); return;
    }
    if (b.dataset.act === "accept" || b.dataset.act === "reject") {
      const a = S.apps.find((x) => x.id === b.dataset.app), p = member(a.memberId);
      S.apps = L.decide(S.apps, a.id, b.dataset.act === "accept" ? "accepted" : "rejected", S.teams); save(); rerender();
      toast(p.name + "님 지원을 " + (b.dataset.act === "accept" ? "수락했어요." : "거절했어요.")); return;
    }
    if (b.dataset.act === "auto") {
      const before = S.members.filter((m) => !L.teamOf(m.id, S.apps)).length;
      S.apps = L.autoAssign(S.members, S.teams, S.apps, nextId); save(); rerender();
      const after = S.members.filter((m) => !L.teamOf(m.id, S.apps)).length;
      toast((before - after) + "명을 배치했어요." + (after ? " 빈 칸이 없어 " + after + "명이 남았어요." : "")); return;
    }
    if (b.dataset.act === "finalize") {
      if (!confirm("편성을 확정할까요? 확정하면 지원과 수락을 더 할 수 없어요.")) return;
      S.finalized = true; save(); rerender(); toast("편성을 확정했어요."); return;
    }
    if (b.dataset.act === "reset") {
      if (!confirm("테스트 데이터로 처음부터 시작할까요? 등록한 프로필과 지원 기록이 지워져요.")) return;
      try { localStorage.removeItem(KEY); } catch (err) { /* 무시 */ }
      draft = { name: "", role: "", domains: [], times: [], intro: "" }; draftErrors = {};
      freshState().then(() => { save(); renderMe(); location.hash = "#/admin"; route(); toast("처음 상태로 돌렸어요."); }).catch((err) => showError(err.message));
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener("input", (e) => { if (e.target.id === "f-name") draft.name = e.target.value; if (e.target.id === "f-intro") draft.intro = e.target.value; });

document.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id === "profileForm") {
    const m = { name: draft.name.trim(), role: draft.role, domains: draft.domains.slice(), times: L.TIMES.filter((t) => draft.times.includes(t)), intro: draft.intro.trim() };
    draftErrors = L.validateMember(m);
    if (Object.keys(draftErrors).length) { rerender(); const first = app.querySelector('[aria-invalid="true"], .err'); toast("입력한 내용을 확인해 주세요."); if (first) (first.closest(".field").querySelector("input, button") || first).focus(); return; }
    const num = S.members.reduce((max, x) => Math.max(max, parseInt(x.id.slice(1), 10) || 0), 0) + 1;
    m.id = "m" + String(num).padStart(2, "0");
    S.members.push(m); S.me = m.id; save(); renderMe();
    draft = { name: "", role: "", domains: [], times: [], intro: "" }; draftErrors = {};
    toast(m.name + "님 프로필을 등록했어요. 맞는 팀을 추천해 드릴게요.");
    location.hash = "#/";
  }
  if (e.target.id === "countForm") {
    const n = parseInt(document.getElementById("f-count").value, 10);
    if (!(n >= 1 && n <= 20)) { toast("팀 수는 1~20 사이로 적어 주세요."); return; }
    if (n !== S.teamCount && !confirm(n + "팀으로 다시 나눌까요? 지금까지의 지원 기록이 처음으로 돌아가요.")) return;
    S.teamCount = n; S.seq = 0;
    S.teams = L.buildTeams(S.baseTeams, S.members, n);
    S.apps = L.leaderApps(S.teams, S.members, nextId);
    save(); renderMe(); rerender(); toast(n + "팀으로 정원을 계산했어요.");
  }
});

boot();
