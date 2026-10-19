// 공지용 스터디 모집 화면. 규칙 계산은 recruit-logic.js가 하고, 여기서는 그리기와 저장만 해요.
// 데이터는 이 브라우저(localStorage)에만 저장돼요. 처음에는 seed.json의 예시 스터디로 시작해요.
import * as R from "/recruit/recruit-logic.js";

const KEY = "study-recruit:v1";
let S = null; // { people, studies, apps, meId, seq }
const app = document.getElementById("app");
const meBtn = document.getElementById("meBtn");
const mePanel = document.getElementById("mePanel");

// ---------- 저장 ----------
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장을 막아도 화면은 그대로 동작해요 */ } }
function nextId(prefix) { S.seq += 1; return prefix + "-" + S.seq; }
function nowMinute() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

async function freshState() {
  const r = await fetch("/recruit/seed.json");
  if (!r.ok) throw new Error("예시 데이터를 불러오지 못했어요.");
  const seed = await r.json();
  return { people: seed.people || [], studies: seed.studies || [], apps: seed.apps || [], meId: null, seq: 0 };
}

async function boot() {
  app.innerHTML = '<div class="skeleton" style="height:240px;margin-top:var(--spacing-40)" aria-label="불러오는 중"></div>';
  try {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    S = saved && Array.isArray(saved.people) && Array.isArray(saved.studies) && Array.isArray(saved.apps) ? saved : await freshState();
  } catch (err) { return showError(err.message); }
  if (S.meId && !person(S.meId)) S.meId = null;
  save();
  renderMe();
  route();
}

// ---------- 도우미 ----------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const person = (id) => S.people.find((p) => p.id === id);
const study = (id) => S.studies.find((s) => s.id === id);
const me = () => (S.meId ? person(S.meId) || null : null);
const STATUS = { pending: "대기", accepted: "수락", rejected: "거절" };
const topicShort = (k) => (R.TOPIC_LABEL[k] || "").split(" · ")[0];
const ICON = {
  add: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
  back: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
  warn: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  check: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  open: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
  flag: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>',
};

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2800);
}
function showError(msg) {
  app.innerHTML = '<div class="sec"><div class="alert" role="alert">' + ICON.warn + '<div><b></b><div><button class="btn btn-outline btn-sm" data-act="reload" style="margin-top:var(--spacing-8)">다시 불러오기</button></div></div></div></div>';
  app.querySelector("b").textContent = msg;
}

// ---------- 구글 로그인 (Google Identity Services) ----------
// 클라이언트 ID는 공개값이에요. 시크릿은 쓰지 않아요.
// 지금은 데이터가 이 브라우저에만 있어서, 구글이 준 토큰은 이름·계정 구분에만 쓰고 서버 검증은 하지 않아요.
// 저장소(Vercel Storage)를 붙이면 서버 함수에서 토큰을 검증해요.
const GOOGLE_CLIENT_ID = "27926126873-q4o4mr6s0bk5rcrcgqg43uclagsc1djo.apps.googleusercontent.com";

function decodeJwt(token) {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function onGoogle(resp) {
  try {
    const t = decodeJwt(resp.credential);
    const id = "me-g" + t.sub;
    const known = person(id);
    if (known) {
      S.meId = id; save(); closePanel(false); refresh();
      toast(known.name + "님, 다시 오셨네요.");
      return;
    }
    pdraft = { name: String(t.name || t.given_name || "").trim().slice(0, 12), role: pdraft.role, google: { sub: t.sub, email: t.email || "" } };
    perrors = {}; refresh(); openPanel(false);
    toast("구글 계정을 확인했어요. 직군을 고르고 저장해 주세요.");
  } catch (e) { toast("구글 로그인 정보를 읽지 못했어요. 닉네임으로 계속해 주세요."); }
}

function mountGoogle() {
  const slots = document.querySelectorAll("[data-gsi]:not([data-done])");
  if (!slots.length) return;
  const g = window.google && window.google.accounts && window.google.accounts.id;
  if (!g) { clearTimeout(mountGoogle.t); mountGoogle.t = setTimeout(mountGoogle, 400); return; }
  if (!mountGoogle.ready) { g.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogle, ux_mode: "popup" }); mountGoogle.ready = true; }
  slots.forEach((el) => {
    el.dataset.done = "1";
    g.renderButton(el, { theme: document.documentElement.dataset.theme === "dark" ? "filled_black" : "outline", size: "large", text: "continue_with", shape: "pill", locale: "ko", width: 260 });
  });
}
new MutationObserver(mountGoogle).observe(document.body, { childList: true, subtree: true });

// ---------- 나 (프로필) ----------
let pdraft = { name: "", role: "" };
let perrors = {};

function profileForm(ctx) {
  const id = (k) => "pf-" + ctx + "-" + k;
  const err = (k) => (perrors[k] ? '<p class="err t-caption1" id="' + id("err-" + k) + '">' + esc(perrors[k]) + "</p>" : "");
  const google = pdraft.google
    ? '<p class="note t-caption1">구글 계정(' + esc(pdraft.google.email) + ')을 확인했어요. 직군을 고르고 저장해 주세요.</p>'
    : '<div class="field"><div data-gsi></div><p class="hint t-caption1">구글로 계속하면 이름이 자동으로 채워지고, 다음에 같은 계정으로 들어오면 내 프로필이 이어져요.</p></div>';
  return '<form class="form compact" data-form="profile" data-ctx="' + ctx + '" novalidate>' + google +
    '<div class="field"><label for="' + id("name") + '">닉네임</label><input id="' + id("name") + '" class="text" data-pf="name" maxlength="12" value="' + esc(pdraft.name) + '" aria-describedby="' + id("hint-name") + (perrors.name ? " " + id("err-name") : "") + '"' + (perrors.name ? ' aria-invalid="true"' : "") + ' autocomplete="nickname"><p class="hint t-caption1" id="' + id("hint-name") + '">2~12자. 스터디 카드와 신청 목록에 보여요.</p>' + err("name") + "</div>" +
    '<div class="field" role="group" aria-labelledby="' + id("l-role") + '"' + (perrors.role ? ' aria-describedby="' + id("err-role") + '"' : "") + '><span class="label" id="' + id("l-role") + '">직군</span><div class="chips" data-group="prole">' +
      R.ROLES.map((r) => '<button type="button" class="chip" data-pick="prole" data-val="' + r.key + '" aria-pressed="' + (pdraft.role === r.key) + '">' + r.label + "</button>").join("") +
      "</div>" + err("role") + "</div>" +
    '<div class="actions"><button class="btn btn-primary btn-sm" type="submit">저장하기</button></div></form>';
}

function renderMe() {
  const m = me();
  document.getElementById("meLabel").textContent = m ? m.name + " · " + R.ROLE_LABEL[m.role] : "나";
  const mine = S.people.filter((p) => p.id.startsWith("me-"));
  const others = S.people.filter((p) => !p.id.startsWith("me-"));
  const opt = (p) => '<option value="' + esc(p.id) + '"' + (p.id === S.meId ? " selected" : "") + ">" + esc(p.name) + " · " + R.ROLE_LABEL[p.role] +
    (S.studies.some((s) => s.leaderId === p.id) ? " (모집자)" : "") + "</option>";
  const select = '<div class="field"><label for="switchMe" class="t-label1">다른 사람으로 보기(테스트용)</label><select id="switchMe">' +
    (mine.length ? '<optgroup label="내 프로필">' + mine.map(opt).join("") + "</optgroup>" : '<option value=""' + (S.meId ? "" : " selected") + ">나 (아직 프로필 없음)</option>") +
    '<optgroup label="예시 사람">' + others.map(opt).join("") + "</optgroup></select>" +
    '<p class="hint t-caption1">모집자(예: 판다스장인)로 바꿔 신청을 수락해 볼 수 있어요.</p></div>';
  const head = m
    ? '<div><h2 class="t-headline1">지금 보는 사람</h2><p class="me-now t-body2"><b>' + esc(m.name) + '</b><span class="tag">' + R.ROLE_LABEL[m.role] + "</span>" + (m.id.startsWith("me-") ? "" : '<span class="tag">예시 사람</span>') + "</p></div>"
    : '<div><h2 class="t-headline1">나를 알려 주세요</h2><p class="note t-caption1">닉네임과 직군을 알려 주면 스터디를 열거나 신청할 수 있어요.</p></div>';
  const form = mine.length ? "" : profileForm("nav");
  mePanel.innerHTML = head + form + '<hr class="divider">' + select;
}

function openPanel(focus = true) {
  mePanel.hidden = false; meBtn.setAttribute("aria-expanded", "true");
  if (focus) { const f = mePanel.querySelector("input, select"); if (f) f.focus(); }
}
function closePanel(returnFocus) {
  if (mePanel.hidden) return;
  mePanel.hidden = true; meBtn.setAttribute("aria-expanded", "false");
  if (returnFocus) meBtn.focus();
}

// ---------- 화면 공통 ----------
function metaLine(s) { return "주 " + s.perWeek + "회 · " + esc(s.days.join("·")) + " · " + esc(s.mode); }

function statusTag(s) {
  if (s.closed) return '<span class="tag">마감</span>';
  if (R.seatsLeft(s, S.apps, S.people) === 0) return '<span class="tag">정원 마감</span>';
  return '<span class="tag status-open">모집 중</span>';
}

// 받침이 있으면 "이", 없으면 "가" (PO처럼 영문은 "가")
function josa(word) {
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? "이" : "가";
  return "가";
}
function missingText(mix) {
  if (!mix.missing.length) return '<p class="missing done t-caption1">네 직군이 모두 모였어요.</p>';
  const names = mix.missing.map((k) => R.ROLE_LABEL[k]);
  return '<p class="missing t-caption1">' + names.join("·") + josa(names[names.length - 1]) + " 아직 없어요</p>";
}

function mixRow(s) {
  const mix = R.roleMix(s, S.apps, S.people);
  return '<ul class="mix" aria-label="직군 구성">' + R.ROLES.map((r) => '<li><span class="tag' + (mix.counts[r.key] ? "" : " zero") + '">' + r.label + " " + mix.counts[r.key] + "</span></li>").join("") + "</ul>" + missingText(mix);
}

function seatsBar(s) {
  const n = R.members(s, S.apps, S.people).length;
  const pct = Math.min(100, Math.round((n / s.capacity) * 100));
  const left = R.seatsLeft(s, S.apps, S.people);
  return '<div class="seats"><div class="line t-caption1"><span>함께하는 사람 <b>' + n + " / " + s.capacity + "명</b></span><span>" + (left ? left + "자리 남았어요" : "정원이 찼어요") + '</span></div><span class="bar' + (left ? "" : " full") + '" aria-hidden="true"><i style="width:' + pct + '%"></i></span></div>';
}

function studyCard(s) {
  const leader = person(s.leaderId);
  return '<li><a class="card study" href="#/s/' + encodeURIComponent(s.id) + '">' +
    '<div class="tags"><span class="tag tag-brand">' + esc(R.TOPIC_LABEL[s.topic] || "주제 없음") + "</span>" + statusTag(s) + "</div>" +
    '<h3 class="t-headline1">' + esc(s.title) + "</h3>" +
    '<p class="goal t-body2">' + esc(s.goal) + "</p>" +
    '<div class="meta t-caption1">' + metaLine(s) + "</div>" +
    '<div class="leader t-caption1">모집자 ' + (leader ? "<b>" + esc(leader.name) + "</b> · " + R.ROLE_LABEL[leader.role] : "알 수 없음") + "</div>" +
    seatsBar(s) + mixRow(s) + "</a></li>";
}

// ---------- 스터디 목록 ----------
let filter = { topic: "all", openOnly: false, needMine: false };

function viewList() {
  const m = me();
  if (!m) filter.needMine = false;
  let list = R.sortStudies(S.studies, S.apps, S.people);
  if (filter.topic !== "all") list = list.filter((s) => s.topic === filter.topic);
  if (filter.openOnly) list = list.filter((s) => R.isOpen(s, S.apps, S.people));
  if (filter.needMine && m) list = list.filter((s) => R.roleMix(s, S.apps, S.people).missing.includes(m.role));
  const any = filter.topic !== "all" || filter.openOnly || filter.needMine;

  const topicChips = '<button type="button" class="chip" data-filter="topic" data-val="all" aria-pressed="' + (filter.topic === "all") + '">전체</button>' +
    R.TOPICS.map((t) => '<button type="button" class="chip" data-filter="topic" data-val="' + t.key + '" aria-pressed="' + (filter.topic === t.key) + '">' + esc(t.label) + "</button>").join("");
  const toggles = '<button type="button" class="chip" data-toggle="openOnly" aria-pressed="' + filter.openOnly + '">' + ICON.check + "모집 중만</button>" +
    '<button type="button" class="chip" data-toggle="needMine" aria-pressed="' + filter.needMine + '"' + (m ? "" : ' disabled aria-describedby="needMineHint"') + ">" + ICON.check + "내 직군이 비어 있는 스터디" + (m ? " (" + R.ROLE_LABEL[m.role] + ")" : "") + "</button>" +
    (m ? "" : '<span id="needMineHint" class="t-caption1 note">위의 "나"에서 직군을 알려 주면 쓸 수 있어요.</span>');

  const body = list.length ? '<ul class="studies">' + list.map(studyCard).join("") + "</ul>"
    : '<div class="empty">' + (any ? "조건에 맞는 스터디가 없어요." : "아직 열린 스터디가 없어요.") +
      '<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)">' + (any ? '<button type="button" class="btn btn-outline btn-sm" data-act="clear-filters">필터 지우기</button>' : "") +
      '<a class="btn btn-primary btn-sm" href="#/new">' + ICON.add + "스터디 열기</a></div></div>";

  return '<header class="page-head head-row"><div><h1 class="t-title1">함께할 스터디를 찾아요</h1><p>주제·횟수·요일·목표를 보고 신청하거나, 직접 스터디를 열어 함께할 사람을 모아요. 6명 이내를 권장해요.</p></div>' +
    '<a class="btn btn-primary" href="#/new">' + ICON.add + "스터디 열기</a></header>" +
    '<section aria-labelledby="list-title"><h2 id="list-title" class="sr">스터디 목록</h2>' +
    '<div class="filters"><div class="row" role="group" aria-labelledby="f-topic-l"><span class="label t-label1" id="f-topic-l">권장 주제</span>' + topicChips + "</div>" +
    '<div class="row" role="group" aria-labelledby="f-view-l"><span class="label t-label1" id="f-view-l">보기</span>' + toggles + "</div></div>" +
    '<p class="count t-label1" aria-live="polite">' + list.length + "개 스터디" + (any ? " (필터 적용)" : "") + "</p>" + body + "</section>";
}

// ---------- 스터디 열기 ----------
const emptyDraft = () => ({ topic: "", title: "", perWeek: "", days: [], mode: "", capacity: String(R.MAX_CAPACITY), goal: "" });
let draft = emptyDraft();
let derrors = {};

function viewNew() {
  const m = me();
  const err = (k) => (derrors[k] ? '<p class="err t-caption1" id="err-' + k + '">' + esc(derrors[k]) + "</p>" : "");
  const desc = (k) => ' aria-describedby="hint-' + k + (derrors[k] ? " err-" + k : "") + '"' + (derrors[k] ? ' aria-invalid="true"' : "");
  const gdesc = (k) => ' aria-describedby="hint-' + k + (derrors[k] ? " err-" + k : "") + '"';
  const profileBox = m ? '<p class="note t-label1" style="margin-bottom:var(--spacing-16)">모집자: <b>' + esc(m.name) + "</b> · " + R.ROLE_LABEL[m.role] + "</p>"
    : '<section class="card" aria-labelledby="pf-title" style="max-width:640px;margin-bottom:var(--spacing-24)"><h2 id="pf-title" class="t-headline1">먼저 나를 알려 주세요</h2><p class="note t-caption1" style="margin-bottom:var(--spacing-12)">스터디를 연 사람(모집자)으로 이름과 직군이 보여요.</p>' + profileForm("page") + "</section>";
  return '<header class="page-head"><a class="more t-label1" href="#/">' + ICON.back + '목록으로</a><h1 class="t-title1" style="margin-top:var(--spacing-8)">스터디 열기</h1><p>학습 주제, 횟수, 요일, 간단 목표를 적으면 다른 사람이 보고 신청해요.</p></header>' +
    profileBox +
    '<form class="form" id="studyForm" novalidate>' +
    '<div class="field" role="group" aria-labelledby="l-topic"' + gdesc("topic") + '><span class="label" id="l-topic">학습 주제</span><div class="chips">' +
      R.TOPICS.map((t) => '<button type="button" class="chip" data-pick="topic" data-val="' + t.key + '" aria-pressed="' + (draft.topic === t.key) + '">' + esc(t.label) + "</button>").join("") +
      '</div><p class="hint t-caption1" id="hint-topic">강사님이 추천한 10월 파이썬 주제 중 하나를 골라요. 없으면 "직접 정하기"를 골라요.</p>' + err("topic") + "</div>" +
    '<div class="field"><label for="f-title">스터디 이름</label><input id="f-title" class="text" data-d="title" maxlength="40" value="' + esc(draft.title) + '"' + desc("title") + '><p class="hint t-caption1" id="hint-title">2~40자. 예: pandas로 CSV 분석해 보기</p>' + err("title") + "</div>" +
    '<div class="field"><label for="f-per">스터디 횟수</label><select id="f-per" class="select half" data-d="perWeek"' + desc("perWeek") + '><option value="">횟수 고르기</option>' +
      [1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (String(draft.perWeek) === String(n) ? " selected" : "") + ">주 " + n + "회</option>").join("") +
      '</select><p class="hint t-caption1" id="hint-perWeek">아래에서 고르는 요일 수와 같아야 해요.</p>' + err("perWeek") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-days"' + gdesc("days") + '><span class="label" id="l-days">진행 요일</span><div class="chips">' +
      R.DAYS.map((d) => '<button type="button" class="chip" data-pick="days" data-val="' + d + '" aria-pressed="' + draft.days.includes(d) + '">' + d + "</button>").join("") +
      '</div><p class="hint t-caption1" id="hint-days">여러 개 골라도 돼요. 10/19부터 진행해요.</p>' + err("days") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-mode"' + gdesc("mode") + '><span class="label" id="l-mode">진행 방식</span><div class="chips">' +
      R.MODES.map((x) => '<button type="button" class="chip" data-pick="mode" data-val="' + esc(x) + '" aria-pressed="' + (draft.mode === x) + '">' + esc(x) + "</button>").join("") +
      '</div><p class="hint t-caption1" id="hint-mode">온라인은 ZEP에서 만나고, 오프라인은 회의실을 예약해요.</p>' + err("mode") + "</div>" +
    '<div class="field"><label for="f-cap">정원 (모집자 포함)</label><select id="f-cap" class="select half" data-d="capacity"' + desc("capacity") + ">" +
      [2, 3, 4, 5, 6].filter((n) => n <= R.MAX_CAPACITY).map((n) => '<option value="' + n + '"' + (String(draft.capacity) === String(n) ? " selected" : "") + ">" + n + "명</option>").join("") +
      '</select><p class="hint t-caption1" id="hint-capacity">6명 이내를 권장해요.</p>' + err("capacity") + "</div>" +
    '<div class="field"><label for="f-goal">간단 목표</label><input id="f-goal" class="text" data-d="goal" maxlength="80" value="' + esc(draft.goal) + '"' + desc("goal") + '><p class="hint t-caption1" id="hint-goal">5~80자. 예: 공공데이터 CSV를 읽어 필터·정렬·집계까지 직접 해 보기</p>' + err("goal") + "</div>" +
    '<div class="actions"><button class="btn btn-primary" type="submit">' + ICON.add + '스터디 열기</button><a class="btn btn-outline" href="#/">취소</a></div>' +
    "</form>";
}

// ---------- 스터디 상세 ----------
function nextSteps(s) {
  return '<section class="card next" aria-labelledby="next-title"><h2 id="next-title" class="t-headline1" tabindex="-1">' + ICON.flag.replace('class="mi"', 'class="mi" style="vertical-align:-4px;margin-right:4px"') + "결성 다음 할 일</h2><ol class=\"t-body2\">" +
    "<li>슬랙 채널을 만들고 함께하는 사람을 모두 초대해요.</li>" +
    "<li>10/19부터 진행해요. 이 스터디는 " + metaLine(s) + "예요.</li>" +
    "<li>주 1회 이상 '10월 ○○팀 스터디 쓰레드'에 인증 사진과 문서화를 남겨요. ZEP은 캠을 켜고 캡처해요.</li>" +
    '<li>오프라인으로 만날 때는 <a href="https://wantedground.vercel.app/" target="_blank" rel="noopener noreferrer">회의실 예약' + ICON.open.replace('class="mi"', 'class="mi" style="width:16px;height:16px;vertical-align:-3px"') + '<span class="sr">(새 창)</span></a>을 해요.</li>' +
    "</ol></section>";
}

function viewDetail(id) {
  const s = study(id);
  if (!s) return '<div class="sec"><div class="empty">찾는 스터디가 없어요. 예시 데이터를 처음부터 다시 불러왔을 수 있어요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><a class="btn btn-outline btn-sm" href="#/">스터디 목록</a><a class="btn btn-primary btn-sm" href="#/new">스터디 열기</a></div></div></div>';
  const m = me();
  const leader = person(s.leaderId);
  const isLeader = !!m && m.id === s.leaderId;
  const list = R.members(s, S.apps, S.people);
  const left = R.seatsLeft(s, S.apps, S.people);
  const open = R.isOpen(s, S.apps, S.people);
  const mix = R.roleMix(s, S.apps, S.people);

  const membersBox = '<section class="card" aria-labelledby="mem-title"><h2 id="mem-title" class="t-headline1">함께하는 사람</h2>' +
    seatsBar(s) +
    '<ul class="rows">' + list.map((p) => '<li><div class="who"><b>' + esc(p.name) + (m && p.id === m.id ? ' <span class="t-caption1 note">(나)</span>' : "") + '</b></div><div class="actions">' +
      (p.id === s.leaderId ? '<span class="tag tag-brand">모집자</span>' : "") + '<span class="tag">' + R.ROLE_LABEL[p.role] + "</span></div></li>").join("") + "</ul>" +
    '<div style="display:grid;gap:var(--spacing-6);margin-top:var(--spacing-8)"><span class="t-label1" style="font-weight:600">직군 구성</span>' + mixRow(s) +
    (mix.missing.length && open ? '<p class="note t-caption1">비개발 직군은 화면 기획·프롬프트를, 개발 직군은 서버·코드를 맡아 함께 만들 수 있어요.</p>' : "") + "</div></section>";

  let side = "";
  if (isLeader) {
    const pending = S.apps.filter((a) => a.studyId === s.id && a.status === "pending");
    const full = left === 0;
    side += '<section class="card" aria-labelledby="pend-title"><h2 id="pend-title" class="t-headline1" tabindex="-1">신청한 사람 <span class="t-label1 note" aria-live="polite">대기 ' + pending.length + "명</span></h2>" +
      (full && pending.length ? '<p class="note t-caption1">정원이 다 차서 더 수락할 수 없어요. 거절하거나 그대로 둘 수 있어요.</p>' : "") +
      (pending.length ? '<ul class="rows">' + pending.map((a) => { const p = person(a.personId); if (!p) return ""; return '<li><div class="who"><b>' + esc(p.name) + ' <span class="tag">' + R.ROLE_LABEL[p.role] + "</span></b><small>" + (a.message ? esc(a.message) : "남긴 말 없음") + "</small></div>" +
        '<div class="actions"><button type="button" class="btn btn-primary btn-sm" data-act="accept" data-app="' + esc(a.id) + '"' + (full ? " disabled" : "") + ' aria-label="' + esc(p.name) + '님 수락">수락</button><button type="button" class="btn btn-outline btn-sm" data-act="reject" data-app="' + esc(a.id) + '" aria-label="' + esc(p.name) + '님 거절">거절</button></div></li>'; }).join("") + "</ul>"
        : '<p class="note t-body2">아직 대기 중인 신청이 없어요.</p>') +
      (s.closed ? '<p class="note t-caption1" style="margin-top:var(--spacing-12)">모집을 마감했어요.</p>'
        : '<div class="actions" style="margin-top:var(--spacing-16)"><button type="button" class="btn btn-outline btn-sm" data-act="close" data-study="' + esc(s.id) + '">모집 마감하기</button></div>') + "</section>";
  } else {
    const mine = m ? R.myApplication(s, S.apps, m.id) : null;
    const can = R.canApply(s, S.apps, S.people, m ? m.id : null);
    let box = '<section class="card" aria-labelledby="apply-title"><h2 id="apply-title" class="t-headline1" tabindex="-1">신청하기</h2>';
    if (mine) box += '<p class="t-body2" style="margin:0 0 var(--spacing-12)">내 신청 <span class="tag status-' + mine.status + '">' + STATUS[mine.status] + "</span>" + (mine.message ? '<br><small class="note">' + esc(mine.message) + "</small>" : "") + "</p>";
    if (can.ok) {
      box += '<form id="applyForm" class="form compact" data-study="' + esc(s.id) + '" novalidate><div class="field"><label for="f-msg">한 줄 메시지 (선택)</label><input id="f-msg" class="text" maxlength="80" aria-describedby="hint-msg" placeholder="예: 차트 화면을 맡아 볼게요"><p class="hint t-caption1" id="hint-msg">80자 안으로 적어요. 모집자에게 보여요.</p></div>' +
        '<div class="actions"><button class="btn btn-primary" type="submit">' + (mine && mine.status === "rejected" ? "다시 신청하기" : "신청하기") + "</button></div></form>";
    } else {
      box += '<p class="note t-body2" style="margin:0">' + esc(can.reason) + "</p>" +
        (m ? "" : '<div class="actions" style="margin-top:var(--spacing-12)"><button type="button" class="btn btn-primary btn-sm" data-act="open-me">닉네임과 직군 알려 주기</button></div>');
    }
    side += box + "</section>";
  }
  if (!open) side += nextSteps(s);

  return '<header class="page-head"><a class="more t-label1" href="#/">' + ICON.back + '목록으로</a>' +
    '<div class="actions" style="margin-top:var(--spacing-12)"><span class="tag tag-brand">' + esc(R.TOPIC_LABEL[s.topic] || "주제 없음") + "</span>" + statusTag(s) + "</div>" +
    '<h1 class="t-title1" style="margin-top:var(--spacing-8)">' + esc(s.title) + "</h1>" +
    "<p>" + metaLine(s) + " · 모집자 " + (leader ? esc(leader.name) + "(" + R.ROLE_LABEL[leader.role] + ")" : "알 수 없음") + "</p>" +
    '<div class="goal-box t-body2"><b>목표</b> ' + esc(s.goal) + "</div></header>" +
    '<div class="two">' + membersBox + '<div class="stack">' + side + "</div></div>";
}

// ---------- 내 스터디 ----------
function viewMy() {
  const m = me();
  const head = '<header class="page-head"><h1 class="t-title1">내 스터디</h1><p>내가 연 스터디와 신청한 스터디를 모아 봐요.</p></header>';
  const reset = '<section class="sec"><button type="button" class="btn btn-outline btn-sm" data-act="reset">예시 데이터로 처음부터</button><p class="note t-caption1" style="margin-top:var(--spacing-8)">이 브라우저에 저장된 프로필·스터디·신청 기록을 지우고 seed 예시로 돌아가요.</p></section>';
  if (!m) return head + '<div class="empty">내 스터디를 보려면 먼저 닉네임과 직군을 알려 주세요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><button type="button" class="btn btn-primary btn-sm" data-act="open-me">나를 알려 주기</button><a class="btn btn-outline btn-sm" href="#/">스터디 둘러보기</a></div></div>' + reset;

  const opened = R.sortStudies(S.studies.filter((s) => s.leaderId === m.id), S.apps, S.people);
  const applied = S.studies.map((s) => ({ s, a: R.myApplication(s, S.apps, m.id) })).filter((x) => x.a && x.s.leaderId !== m.id);

  const openedBox = '<section class="sec" aria-labelledby="opened-title"><div class="sec-head"><h2 id="opened-title" class="t-title3">내가 연 스터디</h2><a class="btn btn-primary btn-sm" href="#/new">' + ICON.add + "스터디 열기</a></div>" +
    (opened.length ? '<ul class="rows card">' + opened.map((s) => {
      const pend = S.apps.filter((a) => a.studyId === s.id && a.status === "pending").length;
      return '<li><div class="who"><a href="#/s/' + encodeURIComponent(s.id) + '">' + esc(s.title) + '</a><small>' + esc(topicShort(s.topic)) + " · " + metaLine(s) + " · " + R.members(s, S.apps, S.people).length + "/" + s.capacity + "명</small></div>" +
        '<div class="actions">' + (pend ? '<span class="tag tag-brand" style="font-weight:600">대기 ' + pend + "명</span>" : "") + statusTag(s) + "</div></li>";
    }).join("") + "</ul>"
      : '<div class="empty">아직 연 스터디가 없어요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><a class="btn btn-primary btn-sm" href="#/new">스터디 열기</a></div></div>') + "</section>";

  const appliedBox = '<section class="sec" aria-labelledby="applied-title" style="padding-top:0"><div class="sec-head"><h2 id="applied-title" class="t-title3">신청한 스터디</h2></div>' +
    (applied.length ? '<ul class="rows card">' + applied.map(({ s, a }) => '<li><div class="who"><a href="#/s/' + encodeURIComponent(s.id) + '">' + esc(s.title) + "</a><small>" + esc(topicShort(s.topic)) + " · " + metaLine(s) + "</small></div>" +
      '<div class="actions"><span class="tag status-' + a.status + '">' + STATUS[a.status] + "</span></div></li>").join("") + "</ul>"
      : '<div class="empty">아직 신청한 스터디가 없어요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><a class="btn btn-outline btn-sm" href="#/">스터디 둘러보기</a></div></div>') + "</section>";

  return head + '<p class="note t-label1">' + esc(m.name) + " · " + R.ROLE_LABEL[m.role] + "</p>" + openedBox + appliedBox + reset;
}

// ---------- 라우팅 ----------
function route() {
  const hash = location.hash || "#/";
  const [, page, id] = hash.split("/");
  let html, name, title;
  if (page === "new") { html = viewNew(); name = "new"; title = "스터디 열기"; }
  else if (page === "my") { html = viewMy(); name = "my"; title = "내 스터디"; }
  else if (page === "s") { html = viewDetail(decodeURIComponent(id || "")); name = "list"; const s = study(decodeURIComponent(id || "")); title = s ? s.title : "스터디 상세"; }
  else { html = viewList(); name = "list"; title = "스터디 목록"; }
  app.innerHTML = html;
  document.querySelectorAll(".nav [data-route]").forEach((a) => (a.dataset.route === name && page !== "s" ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.title = title + " · 스터디 모집 · 스터디 매칭";
}
function rerender(focusSel) {
  const y = scrollY; route(); scrollTo(0, y);
  if (focusSel) { const el = app.querySelector(focusSel); if (el) el.focus(); }
}
function refresh(focusSel) { renderMe(); rerender(focusSel); }
function focusFirstError(root) {
  const e = root.querySelector(".err");
  if (!e) return;
  const f = e.closest(".field");
  const t = f && f.querySelector("input, select, button");
  if (t) t.focus();
}

// ---------- 동작 ----------
window.addEventListener("hashchange", () => { closePanel(false); route(); app.focus({ preventScroll: true }); scrollTo(0, 0); });

meBtn.addEventListener("click", () => (mePanel.hidden ? openPanel() : closePanel(true)));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !mePanel.hidden) closePanel(true); });
document.addEventListener("click", (e) => { if (!mePanel.hidden && !mePanel.contains(e.target) && !meBtn.contains(e.target) && !e.target.closest('[data-act="open-me"]')) closePanel(false); });

document.addEventListener("change", (e) => {
  if (e.target.id === "switchMe") {
    S.meId = e.target.value || null; save(); refresh();
    const m = me();
    toast(m ? m.name + "님으로 보고 있어요." : "프로필 없이 보고 있어요.");
    const sel = document.getElementById("switchMe"); if (sel) sel.focus();
    return;
  }
  if (e.target.dataset && e.target.dataset.d) draft[e.target.dataset.d] = e.target.value;
});
document.addEventListener("input", (e) => {
  const d = e.target.dataset || {};
  if (d.d) draft[d.d] = e.target.value;
  if (d.pf === "name") pdraft.name = e.target.value;
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  try {
    if (b.dataset.act === "reload") { boot(); return; }
    if (b.dataset.act === "open-me") { openPanel(); return; }

    // 폼 안 칩: 화면을 다시 그리지 않고 눌림 상태만 바꿔요 (입력 중인 글과 포커스가 그대로 남아요)
    if (b.dataset.pick) {
      const g = b.dataset.pick, v = b.dataset.val, box = b.parentElement;
      if (g === "days") {
        const i = draft.days.indexOf(v);
        if (i >= 0) draft.days.splice(i, 1); else draft.days.push(v);
        b.setAttribute("aria-pressed", String(i < 0));
        return;
      }
      if (g === "prole") pdraft.role = v; else draft[g] = v;
      box.querySelectorAll("[data-pick]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      return;
    }

    if (b.dataset.filter === "topic") { filter.topic = b.dataset.val; rerender('[data-filter="topic"][data-val="' + b.dataset.val + '"]'); return; }
    if (b.dataset.toggle) { filter[b.dataset.toggle] = !filter[b.dataset.toggle]; rerender('[data-toggle="' + b.dataset.toggle + '"]'); return; }
    if (b.dataset.act === "clear-filters") { filter = { topic: "all", openOnly: false, needMine: false }; rerender('[data-filter="topic"][data-val="all"]'); toast("필터를 지웠어요."); return; }

    if (b.dataset.act === "accept" || b.dataset.act === "reject") {
      const a = S.apps.find((x) => x.id === b.dataset.app);
      const s = a && study(a.studyId), p = a && person(a.personId);
      if (!s) return;
      const status = b.dataset.act === "accept" ? "accepted" : "rejected";
      S.apps = R.decide(s, S.apps, S.people, a.id, status); save(); refresh("#pend-title");
      const full = R.seatsLeft(s, S.apps, S.people) === 0;
      toast((p ? p.name + "님 신청을 " : "신청을 ") + (status === "accepted" ? "수락했어요." : "거절했어요.") + (status === "accepted" && full ? " 정원이 찼어요. 결성 다음 할 일을 확인해요." : ""));
      return;
    }
    if (b.dataset.act === "close") {
      const s = study(b.dataset.study);
      if (!s || !confirm("모집을 마감할까요? 마감하면 새 신청을 받을 수 없어요.")) return;
      s.closed = true; save(); refresh("#next-title"); toast("모집을 마감했어요. 슬랙 채널을 만들어 시작해요.");
      return;
    }
    if (b.dataset.act === "reset") {
      if (!confirm("예시 데이터로 처음부터 시작할까요? 이 브라우저에 저장된 프로필·스터디·신청 기록이 지워져요.")) return;
      try { localStorage.removeItem(KEY); } catch (err) { /* 무시 */ }
      draft = emptyDraft(); derrors = {}; pdraft = { name: "", role: "" }; perrors = {}; filter = { topic: "all", openOnly: false, needMine: false };
      freshState().then((s) => { S = s; save(); renderMe(); location.hash = "#/my"; route(); toast("예시 데이터로 돌렸어요."); }).catch((err) => showError(err.message));
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    if (f.dataset.form === "profile") {
      const p = { name: pdraft.name.trim(), role: pdraft.role };
      perrors = R.validateProfile(p);
      const ctx = f.dataset.ctx;
      if (Object.keys(perrors).length) {
        refresh();
        const root = ctx === "nav" ? mePanel : app;
        toast("닉네임과 직군을 확인해 주세요.");
        focusFirstError(root);
        return;
      }
      p.id = pdraft.google ? "me-g" + pdraft.google.sub : "me-" + Date.now();
      S.people = S.people.filter((x) => x.id !== p.id).concat(p); S.meId = p.id; save();
      pdraft = { name: "", role: "" }; perrors = {};
      closePanel(false); refresh();
      toast(p.name + "님, 반가워요. 이제 스터디를 열거나 신청할 수 있어요.");
      if (ctx === "nav") meBtn.focus();
      return;
    }
    if (f.id === "studyForm") {
      const m = me();
      const s = { topic: draft.topic, title: String(draft.title).trim(), perWeek: Number(draft.perWeek), days: R.DAYS.filter((d) => draft.days.includes(d)), mode: draft.mode, capacity: Number(draft.capacity), goal: String(draft.goal).trim() };
      derrors = R.validateStudy(s);
      if (Object.keys(derrors).length) { rerender(); toast("입력한 내용을 확인해 주세요."); focusFirstError(document.getElementById("studyForm")); return; }
      if (!m) { toast("먼저 닉네임과 직군을 알려 주세요."); const n = app.querySelector('[data-pf="name"]'); if (n) n.focus(); return; }
      s.id = nextId("s"); s.leaderId = m.id; s.closed = false; s.createdAt = nowMinute();
      S.studies.push(s); save();
      draft = emptyDraft(); derrors = {};
      location.hash = "#/s/" + encodeURIComponent(s.id);
      toast("스터디를 열었어요. 신청이 오면 여기에서 수락해요.");
      return;
    }
    if (f.id === "applyForm") {
      const s = study(f.dataset.study), m = me();
      if (!s) return;
      const msg = (document.getElementById("f-msg") || {}).value || "";
      S.apps = R.apply(s, S.apps, S.people, m ? m.id : null, nextId("a"), msg); save(); refresh("#apply-title");
      toast("신청했어요. 모집자가 수락하면 함께해요.");
    }
  } catch (err) { toast(err.message); }
});

boot();
