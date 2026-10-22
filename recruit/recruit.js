// 공지용 스터디 모집 화면. 규칙 계산은 recruit-logic.js가 하고, 여기서는 그리기와 서버 부르기만 해요.
// 스터디·신청·프로필은 서버(/api/recruit → Vercel Storage의 Redis)에 있어서 여러 사람이 같은 목록을 봐요.
// 이 브라우저에는 로그인 확인용 구글 토큰만 만료(1시간)까지 둬요. 서버가 쓰기 요청마다 이 토큰을 검증해요.
// 목록 검색, 모집 마감·다시 열기·모집 취소(모집자), 신청 취소(신청자)는 모두 recruit-logic 규칙을 따르고 서버가 한 번 더 막아요.
// 프로필 창에서 이 기기 브라우저 푸시 알림을 켜면 /sw.js가 알림을 받아 보여 줘요. 같은 알림이 메뉴의 알림함(종 아이콘)에도 쌓여요.
import * as R from "/recruit/recruit-logic.js";

const AUTH_KEY = "study-recruit:auth";
let S = null; // { people, studies, apps } 서버가 준 상태
let auth = null; // { token, sub, exp } 구글 ID 토큰과 계정 번호
let expired = false; // 로그인 시간이 지나서 풀렸는지
let loadedAt = 0;
const app = document.getElementById("app");
const meBtn = document.getElementById("meBtn");
const mePanel = document.getElementById("mePanel");
const noteBtn = document.getElementById("noteBtn");
const notePanel = document.getElementById("notePanel");

// ---------- 로그인 토큰 (이 브라우저) ----------
function loadAuth() {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return a && typeof a.token === "string" && typeof a.sub === "string" && Number.isFinite(a.exp) ? a : null;
  } catch (e) { return null; }
}
function saveAuth(a) {
  auth = a;
  try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch (e) { /* 저장을 막아도 이 화면에서는 로그인돼요 */ }
}
// 만료 1분 전부터는 로그인이 풀린 것으로 봐요
const account = () => (auth && auth.exp * 1000 > Date.now() + 60000 ? auth : null);

// ---------- 서버 ----------
class ApiError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields || null; }
}
// token을 주면 그 토큰으로(로그인 직후 확인), 아니면 저장된 토큰으로 불러요
async function api(method, path, body, token) {
  const headers = {};
  const t = token || (account() && auth.token);
  if (t) headers.Authorization = "Bearer " + t;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res, data = null;
  try { res = await fetch("/api/recruit/" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" }); }
  catch (e) { throw new ApiError(0, "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."); }
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    if (res.status === 401 && !token) loginExpired();
    throw new ApiError(res.status, (data && data.error) || "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.", data && data.fields);
  }
  if (data && data.state) { S = data.state; loadedAt = Date.now(); }
  return data;
}
async function loadState() {
  const d = await api("GET", "state");
  if (!d || !Array.isArray(d.people) || !Array.isArray(d.studies) || !Array.isArray(d.apps)) throw new ApiError(500, "스터디 목록을 읽지 못했어요. 다시 불러와 주세요.");
  S = d; loadedAt = Date.now();
}
function loginExpired() {
  saveAuth(null); expired = true;
  pdraft = emptyP(); perrors = {};
}

// 다른 사람이 바꾼 내용을 다시 받아요 (화면을 옮길 때, 탭으로 돌아올 때, 새로 고침 버튼)
let syncing = null;
function syncState(force = false) {
  if (!S || (!force && Date.now() - loadedAt < 5000)) return Promise.resolve(false);
  if (syncing) return syncing;
  const before = JSON.stringify(S);
  syncing = loadState()
    .then(() => { if (JSON.stringify(S) !== before) softRender(); loadNotes(); return true; }, () => false)
    .finally(() => { syncing = null; });
  return syncing;
}
// 글을 쓰는 중이면 화면을 다시 그리지 않아요 (다음에 그릴 때 새 내용이 보여요)
function softRender() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if (mePanel.hidden) renderMe();
  rerender();
}

const loadingView = () => '<div class="sec" role="status"><span class="sr">스터디 목록을 불러오고 있어요.</span>' +
  '<div class="skeleton" style="height:72px;max-width:560px;margin-bottom:var(--spacing-24)" aria-hidden="true"></div>' +
  '<ul class="studies" aria-hidden="true">' + '<li><div class="skeleton" style="height:240px"></div></li>'.repeat(3) + "</ul></div>";

async function boot() {
  app.setAttribute("aria-busy", "true");
  app.innerHTML = loadingView();
  auth = loadAuth();
  if (auth && !account()) { saveAuth(null); expired = true; }
  try { await loadState(); }
  catch (err) { app.removeAttribute("aria-busy"); renderMe(); return showError(err.message); }
  app.removeAttribute("aria-busy");
  renderMe();
  route();
  loadNotes().then(readOpenStudy);
  if (me() && canPush() && Notification.permission === "granted") checkPush(); // 이 기기 구독을 서버와 맞춰요
}

// ---------- 도우미 ----------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const person = (id) => (S ? S.people.find((p) => p.id === id) : undefined);
const study = (id) => S.studies.find((s) => s.id === id);
const me = () => { const a = account(); return a ? person("me-g" + a.sub) || null : null; };
const STATUS = { pending: "대기", accepted: "수락", rejected: "거절", withdrawn: "신청 취소", left: "나감", removed: "내보내짐" };
const ICON = {
  add: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
  back: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
  warn: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  check: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  open: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
  flag: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>',
  refresh: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
  search: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  block: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z"/></svg>',
  replay: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>',
  bell: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>',
  close: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  info: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
};

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2800);
}
function showError(msg) {
  app.innerHTML = '<div class="sec"><div class="alert" role="alert">' + ICON.warn + '<div><b></b><p class="t-caption1" style="margin:var(--spacing-4) 0 0">잠시 뒤 다시 불러오면 대부분 해결돼요.</p><div><button class="btn btn-outline btn-sm" data-act="reload" style="margin-top:var(--spacing-8)">다시 불러오기</button></div></div></div></div>';
  app.querySelector("b").textContent = msg;
}

// 되돌리기 어려운 동작 전에 띄우는 확인 창. 기본 confirm()은 버튼이 "확인·취소"라 "모집 취소"와 헷갈려서 <dialog>로 만들어요.
// 처음 포커스는 '돌아가기'에 둬서 Enter를 잘못 눌러도 아무 일도 일어나지 않아요. Esc나 바깥을 누르면 돌아가기와 같아요.
const dlg = document.getElementById("confirmDlg");
function confirmBox({ title, body, ok, back = "돌아가기", danger = false }) {
  const opener = document.activeElement;
  const okBtn = dlg.querySelector('[data-dlg="ok"]'), backBtn = dlg.querySelector('[data-dlg="back"]');
  dlg.querySelector("#dlgTitle").textContent = title;
  dlg.querySelector("#dlgBody").textContent = body;
  okBtn.textContent = ok; backBtn.textContent = back;
  okBtn.className = "btn btn-sm " + (danger ? "btn-danger" : "btn-primary");
  dlg.returnValue = "";
  dlg.showModal();
  backBtn.focus();
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => {
      resolve(dlg.returnValue === "ok");
      if (opener && opener.isConnected) opener.focus();
    }, { once: true });
  });
}
dlg.addEventListener("click", (e) => {
  const b = e.target.closest("[data-dlg]");
  if (b) dlg.close(b.dataset.dlg);
  else if (e.target === dlg) dlg.close("back"); // 창 바깥(어두운 곳)
});
// 규칙 함수가 막는지 미리 보고 이유를 받아요 (화면에서 규칙을 따로 계산하지 않으려고요)
function check(fn) {
  try { fn(); return { ok: true }; } catch (e) { return { ok: false, reason: e.message }; }
}

// 서버에 보내는 동안 버튼을 막고 "…하는 중"을 보여 줘요. 한 번에 하나만 보내요.
let working = false;
async function run(btn, label, fn) {
  if (working) return;
  working = true;
  const old = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.textContent = label; }
  try { await fn(); }
  catch (err) { failed(err); }
  finally {
    working = false;
    if (btn && btn.isConnected) { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.innerHTML = old; }
  }
}
function failed(err) {
  toast(err.message || "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.");
  if (err.status === 401) { refresh(); openPanel(false); return; }
  // 다른 사람이 먼저 바꿨을 수 있어요 (정원 마감, 모집 마감 등). 최신 내용으로 다시 그려요.
  if (err.status === 403 || err.status === 404 || err.status === 409) syncState(true);
}

// ---------- 구글 로그인 (Google Identity Services) ----------
// 클라이언트 ID는 공개값이에요. 시크릿은 쓰지 않아요.
// 구글이 준 ID 토큰은 서버(/api/recruit/me)가 검증하고, 확인된 계정 번호(sub)로 "me-g"+sub를 내 id로 써요.
const GOOGLE_CLIENT_ID = "27926126873-q4o4mr6s0bk5rcrcgqg43uclagsc1djo.apps.googleusercontent.com";

async function onGoogle(resp) {
  toast("구글 계정을 확인하고 있어요.");
  try {
    const d = await api("GET", "me", undefined, resp.credential);
    saveAuth({ token: resp.credential, sub: d.account.sub, exp: d.account.exp });
    expired = false; perrors = {};
    if (!S) { boot(); return; } // 목록을 아직 못 불러왔으면 로그인한 채로 다시 불러와요
    if (d.person) {
      S.people = S.people.filter((p) => p.id !== d.person.id).concat(d.person);
      pdraft = emptyP(); closePanel(false); refresh(); loadNotes().then(readOpenStudy);
      toast(d.person.name + "님, 다시 오셨네요.");
      return;
    }
    pdraft = { name: String(d.account.name || "").trim().slice(0, 12), role: pdraft.role, tags: pdraft.tags || [], email: d.account.email || "" };
    refresh();
    toast("구글 계정을 확인했어요. 직군을 고르고 저장해 주세요.");
  } catch (e) { toast(e.status === 401 ? "구글 로그인을 확인하지 못했어요. 다시 시도해 주세요." : e.message); }
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

// ---------- 사이트 알림함 ----------
// 푸시와 같은 알림이 서버 알림함(/api/recruit/notes)에 쌓여요. 메뉴의 종 아이콘에 안 읽은 개수를 보여 주고,
// 알림을 누르거나 그 스터디 상세를 열면 읽음으로 바꿔요(푸시를 눌러 들어와도 읽음이 돼요).
let notes = null; // 내 알림 목록 (null: 아직 못 받음)
let notesError = false;
async function loadNotes() {
  if (!me()) { notes = null; notesError = false; renderNoteBtn(); return; }
  try { notes = (await api("GET", "notes")).notes; notesError = false; }
  catch (e) { notesError = true; }
  renderNoteBtn();
  if (!notePanel.hidden) renderNotes();
}
function renderNoteBtn() {
  const n = notes ? R.unreadCount(notes) : 0;
  noteBtn.hidden = !me();
  const badge = document.getElementById("noteBadge");
  badge.hidden = !n;
  badge.textContent = n > 9 ? "9+" : String(n);
  noteBtn.setAttribute("aria-label", n ? "알림, 안 읽은 알림 " + n + "개" : "알림");
}
const noteTime = (at) => (at ? Number(at.slice(5, 7)) + "/" + Number(at.slice(8, 10)) + " " + at.slice(11, 16) : "");
function renderNotes() {
  let body;
  if (!notes && notesError) body = '<div class="alert" role="alert">' + ICON.warn + '<div><b>알림을 불러오지 못했어요.</b><div><button type="button" class="btn btn-outline btn-sm" data-act="notes-retry" style="margin-top:var(--spacing-8)">다시 불러오기</button></div></div></div>';
  else if (!notes) body = '<div role="status"><span class="sr">알림을 불러오고 있어요.</span><div class="skeleton" style="height:64px" aria-hidden="true"></div><div class="skeleton" style="height:64px;margin-top:var(--spacing-8)" aria-hidden="true"></div></div>';
  else if (!notes.length) body = '<div class="empty note-empty">아직 알림이 없어요.<br><span class="t-caption1">새 신청이나 수락 같은 소식이 생기면 여기에 쌓여요.</span></div>';
  else body = '<ul class="note-list">' + notes.map((n) => '<li><a href="' + esc(n.url) + '" class="inbox-item' + (n.read ? "" : " unread") + '" data-note="' + esc(n.id) + '">' +
    '<b class="t-label1">' + esc(n.title) + '</b><span class="t-caption1">' + esc(n.body) + '</span><small class="t-caption1">' + noteTime(n.at) + (n.read ? "" : ' · <span class="new">새 알림</span>') + "</small></a></li>").join("") + "</ul>";
  const unread = notes ? R.unreadCount(notes) : 0;
  // 받아 둔 목록이 있는데 새로 못 받았으면, 목록은 그대로 두고 한 줄로 알려요
  const stale = notes && notesError ? '<p class="note t-caption1" role="status">새 알림을 불러오지 못했어요. <button type="button" class="btn btn-outline btn-sm" data-act="notes-retry">다시 불러오기</button></p>' : "";
  notePanel.innerHTML = '<div class="note-head"><h2 class="t-headline1">알림</h2>' + (unread ? '<button type="button" class="btn btn-outline btn-sm" data-act="notes-read-all">모두 읽음</button>' : "") + "</div>" + stale + body;
}
// 읽음으로 바꾸기: 화면에 먼저 반영하고 서버에 알려요 (실패하면 다음에 불러올 때 서버 상태로 돌아와요)
async function readNotes(ids) {
  if (!notes || (ids !== "all" && !ids.length)) return;
  notes = R.markRead(notes, ids);
  renderNoteBtn();
  if (!notePanel.hidden) renderNotes();
  try {
    notes = (await api("PATCH", "notes", ids === "all" ? { all: true } : { ids })).notes;
    renderNoteBtn();
    if (!notePanel.hidden) renderNotes();
  } catch (e) { /* 다음에 다시 불러오면 맞춰져요 */ }
}
// 스터디 상세를 열면 그 스터디의 안 읽은 알림을 읽음으로 바꿔요
function readOpenStudy() {
  if (document.visibilityState !== "visible") return;
  const [, page, id] = (location.hash || "#/").split("/");
  if (page === "s" && notes) readNotes(R.unreadFor(notes, decodeURIComponent(id || "")));
}
function openNotes() {
  closePanel(false);
  notePanel.hidden = false; noteBtn.setAttribute("aria-expanded", "true");
  renderNotes(); loadNotes();
  const h = notePanel.querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
}
function closeNotes(returnFocus) {
  if (notePanel.hidden) return;
  notePanel.hidden = true; noteBtn.setAttribute("aria-expanded", "false");
  if (returnFocus) noteBtn.focus();
}

// ---------- 브라우저 푸시 알림 (이 기기) ----------
// pushState: "" 확인 전 · unsupported 이 브라우저는 못 받음 · off 서버에 알림 키가 없음 · denied 브라우저 설정에서 막힘
//            · on 이 기기에서 받는 중 · ready 켤 수 있음 · error 확인 실패
let pushState = "";
let pushKey = null; // 서버가 준 VAPID 공개키 ("": 알림 꺼진 서버)
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
async function pushSub() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (reg) reg.update().catch(() => {}); // 새 sw.js가 있으면 받아 와요
  return reg ? reg.pushManager.getSubscription() : null;
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type !== "push-received") return;
    loadNotes();
  });
}
async function checkPush() {
  if (!canPush()) pushState = "unsupported";
  else {
    try {
      if (pushKey === null) { const d = await api("GET", "push"); pushKey = d && d.enabled ? d.publicKey : ""; }
      if (!pushKey) pushState = "off";
      else if (Notification.permission === "denied") pushState = "denied";
      else {
        const sub = await pushSub();
        if (!sub) pushState = "ready";
        else if (!me()) pushState = "on";
        else {
          // 이 브라우저에 구독이 있어도 서버에 없을 수 있어요(켤 때 로그인이 만료됐거나, 브라우저가 구독을 바꾼 경우).
          // 그래서 볼 때마다 서버에 다시 저장해서 맞춰요. 서버는 같은 기기를 한 번만 저장해요.
          try { await api("POST", "push", { subscription: sub.toJSON() }); pushState = "on"; }
          catch (e) { pushState = "unsynced"; }
        }
      }
    } catch (e) { pushState = "error"; }
  }
  const box = document.getElementById("pushBox");
  if (box) box.outerHTML = pushBox(); // 프로필 창의 알림 칸만 바꿔요 (입력 중인 이름은 그대로예요)
}
// VAPID 공개키(base64url) → 바이트
function keyBytes(s) {
  const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function pushBox() {
  const btn = (act, label, cls = "btn-outline") => '<div class="actions"><button type="button" class="btn ' + cls + ' btn-sm" data-act="' + act + '">' + label + "</button></div>";
  const [text, action] = {
    "": ["알림 설정을 확인하고 있어요.", ""],
    unsupported: [IOS ? "아이폰·아이패드는 사파리 공유 버튼에서 ‘홈 화면에 추가’를 한 뒤, 그 앱에서 알림을 켤 수 있어요." : "이 브라우저는 알림을 지원하지 않아요.", ""],
    off: ["알림은 아직 준비 중이에요.", ""],
    error: ["알림 설정을 확인하지 못했어요.", btn("push-check", "다시 확인")],
    denied: ["브라우저 설정에서 이 사이트 알림이 막혀 있어요. 설정에서 허용한 뒤 다시 확인해 주세요.", btn("push-check", "다시 확인")],
    unsynced: ["이 기기 알림 설정을 서버에 저장하지 못했어요. 그래서 이 기기로는 알림이 가지 않아요.", btn("push-check", "다시 저장")],
    on: ["이 기기에서 새 신청·수락 같은 소식을 알림으로 받고 있어요.", btn("push-off", "이 기기 알림 끄기")],
    ready: ["새 신청이나 수락·거절 소식을 사이트를 닫아 둬도 이 기기 알림으로 받아요.", btn("push-on", ICON.bell + "이 기기에서 알림 받기", "btn-primary")],
  }[pushState] || ["", ""];
  return '<div id="pushBox" class="push-box" aria-live="polite"><span class="t-label1" style="font-weight:600">알림</span><p class="note t-caption1">' + text + "</p>" + action + "</div>";
}

// ---------- 나 (프로필) ----------
const emptyP = () => ({ name: "", role: "", tags: [] }); // 프로필 초안: 이름·직군·해시태그
let pdraft = emptyP();
let perrors = {};

// 로그인 전에는 구글 버튼만 보여 줘요
const googleBox = () => '<div class="field">' + (expired ? '<p class="note t-caption1" style="margin-bottom:var(--spacing-8)">로그인 시간이 지났어요. 다시 로그인하면 이어서 할 수 있어요.</p>' : "") +
  '<div data-gsi></div><p class="hint t-caption1">다음에 같은 계정으로 들어오면 내 프로필이 이어져요.</p></div>';
// 로그인 전: 구글 버튼 / 처음 로그인: 이름·직군 정하기 / 로그인 뒤: 이름·직군 고치기
const loginOrProfile = (ctx) => (account() ? profileForm(ctx) : googleBox());

// ---------- 해시태그 입력칸 (프로필 "profile" · 스터디 열기 "study"가 같이 써요) ----------
// 적고 Enter나 쉼표를 누르면 칩이 돼요. 다듬기·검사는 recruit-logic이 하고, 여기서는 칩 줄만 다시 그려요(입력 중인 글과 포커스는 그대로예요).
const tagListOf = (key) => (key === "profile" ? pdraft.tags : draft.tags) || [];
function setTagList(key, list) { if (key === "profile") pdraft.tags = list; else draft.tags = list; }
const hashText = (t) => "#" + esc(t);
function tagChipsHtml(tags) {
  return tags.map((t, i) => '<span class="tag tag-brand tag-chip">' + hashText(t) + '<button type="button" class="tag-del" data-tagdel="' + i + '" aria-label="' + hashText(t) + ' 빼기">' + ICON.close + "</button></span>").join("");
}
function tagSuggestHtml(tags) {
  const list = S ? R.tagSuggestions(S.people, S.studies, { exclude: tags }) : [];
  if (!list.length) return "";
  return '<span class="t-caption1 note">많이 쓰는 태그</span>' + list.map((t) => '<button type="button" class="chip chip-sm" data-tagadd="' + esc(t) + '" aria-label="' + hashText(t) + ' 달기">' + ICON.add + hashText(t) + "</button>").join("");
}
function tagErrHtml(idp, error) { return error ? '<p class="err t-caption1" id="' + idp + '-err-tags">' + esc(error) + "</p>" : ""; }
function tagField(key, idp, tags, error) {
  const desc = idp + "-hint-tags" + (error ? " " + idp + "-err-tags" : "");
  return '<div class="field" data-tagfield="' + key + '" data-idp="' + idp + '"><label for="' + idp + '-tags">해시태그 <span class="note t-caption1">(선택)</span></label>' +
    '<div class="tag-input"><span class="tag-chips" data-tagchips>' + tagChipsHtml(tags) + "</span>" +
    '<input id="' + idp + '-tags" class="tag-text" data-taginput="' + key + '" placeholder="#프리온보딩7기처럼 적고 Enter" enterkeyhint="done" autocomplete="off" aria-describedby="' + desc + '"' + (error ? ' aria-invalid="true"' : "") + "></div>" +
    '<p class="hint t-caption1" id="' + idp + '-hint-tags">여러 개 달 수 있어요. ' + R.MAX_TAGS + "개까지, 글자·숫자·_만 써요. 기수도 태그로 달아요.</p>" +
    '<div data-tagerr>' + tagErrHtml(idp, error) + '</div><span class="sr" aria-live="polite" data-taglive></span>' +
    '<div class="tag-suggest" data-tagsuggest>' + tagSuggestHtml(tags) + "</div></div>";
}
// 같은 목록을 쓰는 칸(내 프로필 창과 스터디 열기 화면의 프로필 칸)을 함께 다시 그려요
function redrawTags(key) {
  const tags = tagListOf(key);
  document.querySelectorAll('[data-tagfield="' + key + '"]').forEach((f) => {
    f.querySelector("[data-tagchips]").innerHTML = tagChipsHtml(tags);
    f.querySelector("[data-tagsuggest]").innerHTML = tagSuggestHtml(tags);
  });
}
function setTagError(field, error) {
  const idp = field.dataset.idp, input = field.querySelector("[data-taginput]");
  field.querySelector("[data-tagerr]").innerHTML = tagErrHtml(idp, error);
  input.setAttribute("aria-describedby", idp + "-hint-tags" + (error ? " " + idp + "-err-tags" : ""));
  if (error) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
}
const tagLive = (field, msg) => { field.querySelector("[data-taglive]").textContent = msg; };
// 태그 더하기: 틀리면 칸 아래에 이유를 보여 주고 false (입력한 글자는 그대로 둬요)
function addTagsTo(field, add) {
  const key = field.dataset.tagfield;
  const next = R.cleanTags(tagListOf(key).concat(add));
  const error = R.validateTags(next);
  setTagError(field, error);
  if (error) return false;
  setTagList(key, next); redrawTags(key);
  tagLive(field, add.map((t) => "#" + R.normalizeTag(t)).join(" ") + " 태그를 달았어요.");
  return true;
}
// 입력칸에 남은 글자를 태그로 더해요. 비어 있으면 true
function flushTagInput(input) {
  const add = R.parseTagInput(input.value);
  if (!add.length) { input.value = ""; return true; }
  if (!addTagsTo(input.closest("[data-tagfield]"), add)) return false;
  input.value = "";
  return true;
}
function removeTagAt(field, i) {
  const key = field.dataset.tagfield, list = tagListOf(key).slice();
  const [gone] = list.splice(i, 1);
  if (gone === undefined) return;
  setTagList(key, list); redrawTags(key); setTagError(field, "");
  tagLive(field, "#" + gone + " 태그를 뺐어요.");
  field.querySelector("[data-taginput]").focus();
}

function profileForm(ctx) {
  const id = (k) => "pf-" + ctx + "-" + k;
  const err = (k) => (perrors[k] ? '<p class="err t-caption1" id="' + id("err-" + k) + '">' + esc(perrors[k]) + "</p>" : "");
  // 이메일은 로그인 직후 확인 문구에만 보여 주고 저장하지 않아요
  const google = !me() && account()
    ? '<p class="note t-caption1">' + (pdraft.email ? "구글 계정(" + esc(pdraft.email) + ")을" : "구글 계정을") + " 확인했어요. 직군을 고르고 저장해 주세요.</p>"
    : "";
  return '<form class="form compact" data-form="profile" data-ctx="' + ctx + '" novalidate>' + google +
    '<div class="field"><label for="' + id("name") + '">보여 줄 이름</label><input id="' + id("name") + '" class="text" data-pf="name" maxlength="12" value="' + esc(pdraft.name) + '" aria-describedby="' + id("hint-name") + (perrors.name ? " " + id("err-name") : "") + '"' + (perrors.name ? ' aria-invalid="true"' : "") + ' autocomplete="nickname"><p class="hint t-caption1" id="' + id("hint-name") + '">2~12자. 스터디 카드와 신청 목록에 보여요.</p>' + err("name") + "</div>" +
    '<div class="field" role="group" aria-labelledby="' + id("l-role") + '"' + (perrors.role ? ' aria-describedby="' + id("err-role") + '"' : "") + '><span class="label" id="' + id("l-role") + '">직군</span><div class="chips" data-group="prole">' +
      R.ROLES.map((r) => '<button type="button" class="chip" data-pick="prole" data-val="' + r.key + '" aria-pressed="' + (pdraft.role === r.key) + '">' + r.label + "</button>").join("") +
      "</div>" + err("role") + "</div>" +
    tagField("profile", "pf-" + ctx, pdraft.tags || [], perrors.tags) +
    '<div class="actions"><button class="btn btn-primary btn-sm" type="submit">' + (me() ? "고치기" : "저장하기") + "</button></div></form>";
}

function renderMe() {
  const m = me();
  renderNoteBtn();
  if (m && !pdraft.name && !pdraft.role) pdraft = { name: m.name, role: m.role, tags: R.tagsOf(m).slice() };
  document.getElementById("meLabel").textContent = m ? m.name + " · " + R.ROLE_LABEL[m.role] : "로그인";
  mePanel.innerHTML = m
    ? '<div><h2 class="t-headline1">내 프로필</h2><p class="me-now t-body2"><b>' + esc(m.name) + '</b><span class="tag">' + R.ROLE_LABEL[m.role] + "</span>" + R.tagsOf(m).map((t) => '<span class="tag tag-brand">' + hashText(t) + "</span>").join("") + "</p></div>" +
      profileForm("nav") + '<hr class="divider">' + pushBox() + '<hr class="divider"><button type="button" class="btn btn-outline btn-sm" data-act="logout">로그아웃</button>' +
      '<div class="danger-zone"><hr class="divider"><div><b class="t-label1">회원 탈퇴</b><p class="note t-caption1">이름·직군·알림을 지우고, 내가 연 스터디는 모집 취소, 내 신청은 취소돼요. 되돌릴 수 없어요.</p></div>' +
      '<button type="button" class="btn btn-danger btn-sm" data-act="delete-account">' + ICON.block + "회원 탈퇴</button></div>"
    : account()
      ? '<div><h2 class="t-headline1">이름과 직군 정하기</h2><p class="note t-caption1">저장하면 스터디를 열거나 신청할 수 있어요.</p></div>' + profileForm("nav") + '<hr class="divider"><button type="button" class="btn btn-outline btn-sm" data-act="logout">다른 계정으로 로그인</button>'
      : '<div><h2 class="t-headline1">구글로 로그인</h2><p class="note t-caption1">로그인하면 스터디를 열거나 신청할 수 있어요.</p></div>' + googleBox();
}

function openPanel(focus = true) {
  closeNotes(false);
  mePanel.hidden = false; meBtn.setAttribute("aria-expanded", "true");
  if (me()) checkPush();
  if (focus) { const f = mePanel.querySelector("input, select"); if (f) f.focus(); }
}
function closePanel(returnFocus) {
  if (mePanel.hidden) return;
  mePanel.hidden = true; meBtn.setAttribute("aria-expanded", "false");
  if (returnFocus) meBtn.focus();
}

// ---------- 화면 공통 ----------
const perWeekText = (n) => (n ? "주 " + n + "회로 진행해요." : "고른 요일 수만큼 주 횟수가 정해져요.");
// 진행 시간대를 고르지 않은 스터디는 "시간은 모여서 정해요"로 보여 줘요
const timeText = (s) => (s.times && s.times.length ? s.times.join("·") : "시간은 모여서 정해요");
function metaLine(s) { return "주 " + s.days.length + "회 · " + esc(s.days.join("·")) + " · " + esc(timeText(s)) + " · " + esc(s.mode); }
// 시간대 칩 (여러 개 고르기). 고를 수 있는 시간대가 없으면 안내를 보여 줘요
function timeChips(group, list, picked, emptyText) {
  if (!list.length) return '<p class="note t-caption1">' + emptyText + "</p>";
  return list.map((t) => '<button type="button" class="chip" data-pick="' + group + '" data-val="' + esc(t) + '" aria-pressed="' + picked.includes(t) + '">' + esc(t) + "</button>").join("");
}
const NEED_DAYS = "요일을 먼저 고르면 맞는 시간대가 나와요.";
// 일정: "2026-10-25" → "10/25". 카드·상세에는 "모집 ~10/25 · 진행 10/27~11/30"처럼 보여요
const md = (d) => Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10));
function dateLine(s) {
  const parts = [];
  if (s.deadline) parts.push("모집 ~" + md(s.deadline));
  if (s.startDate || s.endDate) parts.push("진행 " + (s.startDate ? md(s.startDate) : "") + (s.endDate ? "~" + md(s.endDate) : "부터"));
  return parts.join(" · ");
}
// 모집 중이고 마감일이 있으면 "마감 D-3", 마감일 당일이면 "오늘 마감"
function dueTag(s) {
  const n = R.daysLeft(s);
  if (n === null || n < 0 || R.studyStatus(s, S.apps, S.people) !== "open") return "";
  return '<span class="tag tag-brand">' + (n === 0 ? "오늘 마감" : "마감 D-" + n) + "</span>";
}
// 모집 마감일이 지나서 마감됐는지 (모집자가 직접 마감한 것과 안내가 달라요)
const closedByDate = (s) => !s.closed && !s.canceled && R.studyStatus(s, S.apps, S.people) === "closed";

const STUDY_TAG = { open: ["tag status-open", "모집 중"], full: ["tag", "정원 마감"], closed: ["tag", "마감"], canceled: ["tag tag-negative", "취소됨"] };
function statusTag(s) {
  const [cls, label] = STUDY_TAG[R.studyStatus(s, S.apps, S.people)];
  return '<span class="' + cls + '">' + label + "</span>";
}
// 내 신청 태그: 스터디가 취소됐으면 신청 상태보다 "스터디 취소됨"을 먼저 보여 줘요
function appTag(s, a) {
  return s.canceled ? '<span class="tag tag-negative">스터디 취소됨</span>' : '<span class="tag status-' + a.status + '">' + STATUS[a.status] + "</span>";
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

// 해시태그 버튼: 누르면 목록 검색어에 #태그를 넣거나 빼요 (눌림 = 지금 검색어에 들어 있음)
const tagQBtn = (t, cls = "tag tag-btn") => '<button type="button" class="' + cls + '" data-tagq="' + esc(t) + '" aria-pressed="' + R.tagInQuery(filter.q, t) + '">' + hashText(t) + "</button>";
// 카드에는 태그를 3개까지 보여 주고 나머지는 "+2"처럼 수만 적어요
function cardTags(s) {
  const tags = R.tagsOf(s);
  if (!tags.length) return "";
  const more = tags.length - 3;
  return '<div class="study-tags" role="group" aria-label="해시태그">' + tags.slice(0, 3).map((t) => tagQBtn(t)).join("") + (more > 0 ? '<span class="note t-caption1">+' + more + '<span class="sr">개 더</span></span>' : "") + "</div>";
}

// 카드 전체를 누르면 상세로 가요(제목 링크가 카드를 덮어요). 해시태그 버튼은 그 위에 있어서 따로 눌려요.
function studyCard(s) {
  const leader = person(s.leaderId);
  return '<li><article class="card study">' +
    '<div class="tags">' + statusTag(s) + dueTag(s) + "</div>" +
    '<h3 class="t-headline1"><a class="study-link" href="#/s/' + encodeURIComponent(s.id) + '">' + esc(s.title) + "</a></h3>" + cardTags(s) +
    '<p class="goal t-body2">' + esc(s.goal) + "</p>" +
    '<div class="meta t-caption1">' + metaLine(s) + "</div>" +
    (dateLine(s) ? '<div class="meta t-caption1">' + dateLine(s) + "</div>" : "") +
    '<div class="leader t-caption1">모집자 ' + (leader ? "<b>" + esc(leader.name) + "</b> · " + R.ROLE_LABEL[leader.role] : "탈퇴한 사람") + "</div>" +
    seatsBar(s) + mixRow(s) + "</article></li>";
}

// 다른 사람이 바꾼 내용(새 스터디, 신청, 수락)을 바로 보고 싶을 때 눌러요
const syncBtn = (label) => '<button type="button" class="btn btn-outline btn-sm" data-act="sync">' + ICON.refresh + esc(label) + "</button>";

// ---------- 스터디 목록 ----------
// 검색어(q)는 스터디 이름·목표·모집자 이름에서 찾고, "모집 중만"·"내 직군이 비어 있는 스터디"와 함께 걸러요. 취소한 스터디는 보이지 않아요.
let filter = { q: "", openOnly: false, needMine: false };
const anyFilter = () => !!(filter.q.trim() || filter.openOnly || filter.needMine);

function listedStudies() {
  const m = me();
  if (!m) filter.needMine = false;
  return R.filterStudies(S.studies, S.apps, S.people, { q: filter.q, openOnly: filter.openOnly, needRole: filter.needMine && m ? m.role : "" });
}
const countText = (n) => (anyFilter() ? "조건에 맞는 스터디 " + n + "개" : "스터디 " + n + "개");

function listBody(list) {
  if (list.length) return '<ul class="studies">' + list.map(studyCard).join("") + "</ul>";
  const any = anyFilter(), q = filter.q.trim();
  return '<div class="empty"><b>' + (q ? "‘" + esc(q) + "’에 맞는 스터디가 없어요." : any ? "조건에 맞는 스터디가 없어요." : "아직 열린 스터디가 없어요.") + "</b>" +
    (any ? '<p class="t-caption1" style="margin:var(--spacing-6) 0 0">다른 낱말로 찾거나 필터를 지워 보세요. 원하는 스터디가 없으면 직접 열 수 있어요.</p>' : "") +
    '<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)">' + (any ? '<button type="button" class="btn btn-outline btn-sm" data-act="clear-filters">필터 지우기</button>' : "") +
    '<a class="btn btn-primary btn-sm" href="#/new">' + ICON.add + "스터디 열기</a></div></div>";
}

// 검색어를 칠 때는 목록과 개수만 바꿔요 (검색창을 다시 그리지 않아서 입력 중인 글자와 포커스가 그대로예요)
function updateResults() {
  const box = document.getElementById("results"), count = document.getElementById("count");
  if (!box || !count || !S) return;
  const list = listedStudies();
  box.innerHTML = listBody(list);
  count.textContent = countText(list.length);
  syncTagPressed();
}
// 검색어가 바뀌면 내 해시태그 칩의 눌림 상태도 맞춰요
function syncTagPressed() {
  document.querySelectorAll("[data-tagq]").forEach((x) => x.setAttribute("aria-pressed", String(R.tagInQuery(filter.q, x.dataset.tagq))));
}
// 칩·카드 태그로 검색어를 바꿔요. 검색창 글자와 목록·개수만 바꾸고 화면 전체는 다시 그리지 않아요
function setQuery(q, focusSearch) {
  filter.q = q;
  const input = document.getElementById("f-q");
  if (input) input.value = q;
  updateResults();
  if (focusSearch && input) input.focus();
}

// 활기 숫자 칸: 사람들이 실제로 쓰고 있다는 걸 숫자로 보여 줘요 (이름은 보여 주지 않아요). 계산은 recruit-logic이 해요.
function statsRow() {
  const st = R.activityStats(S.studies, S.apps, S.people);
  const tile = (label, value, unit, sub) => '<li class="stat"><span class="stat-label t-caption1">' + label + '</span><span class="stat-value"><b>' + value + "</b>" + unit + '</span><span class="stat-sub t-caption1">' + sub + "</span></li>";
  return '<section class="stats" aria-labelledby="stats-title"><h2 id="stats-title" class="sr">지금 스터디 모집 현황</h2><ul class="stat-row">' +
    tile("가입한 사람", st.people, "명", R.ROLES.map((r) => r.label + " " + st.roles[r.key]).join(" · ")) +
    tile("모집 중인 스터디", st.openStudies, "개", "지금 신청할 수 있어요") +
    tile("스터디에 함께하는 사람", st.members, "명", "모집자와 수락된 사람") +
    tile("최근 7일 새 스터디", st.newThisWeek, "개", "오늘 연 스터디 포함") +
    "</ul></section>";
}

function viewList() {
  const m = me();
  const list = listedStudies();

  const search = '<div class="row"><label class="label t-label1" for="f-q">찾기</label><div class="input search">' + ICON.search +
    '<input id="f-q" type="search" data-search value="' + esc(filter.q) + '" placeholder="스터디 이름·목표·모집자·#해시태그" autocomplete="off" enterkeyhint="search" aria-describedby="f-q-hint"></div>' +
    '<span id="f-q-hint" class="sr">칠 때마다 아래 목록이 바뀌어요. #을 붙이면 해시태그에서 찾아요.</span></div>';
  // 내 해시태그: 누르면 그 태그 스터디만 남아요(다시 누르면 빠져요)
  const myTags = m ? R.tagsOf(m) : [];
  const mine = myTags.length ? '<div class="row" role="group" aria-labelledby="f-tags-l"><span class="label t-label1" id="f-tags-l">내 해시태그</span>' + myTags.map((t) => tagQBtn(t, "chip")).join("") + "</div>" : "";
  const toggles = '<button type="button" class="chip" data-toggle="openOnly" aria-pressed="' + filter.openOnly + '">' + ICON.check + "모집 중만</button>" +
    '<button type="button" class="chip" data-toggle="needMine" aria-pressed="' + filter.needMine + '"' + (m ? "" : ' disabled aria-describedby="needMineHint"') + ">" + ICON.check + "내 직군이 비어 있는 스터디" + (m ? " (" + R.ROLE_LABEL[m.role] + ")" : "") + "</button>" +
    (m ? "" : '<span id="needMineHint" class="t-caption1 note">로그인하면 쓸 수 있어요.</span>');

  return '<header class="page-head head-row"><div><h1 class="t-title1">함께할 스터디를 찾아요</h1><p>스터디 이름·요일·목표를 보고 신청하거나, 직접 스터디를 열어 함께할 사람을 모아요. 6명 이내를 권장해요.</p></div>' +
    '<a class="btn btn-primary" href="#/new">' + ICON.add + "스터디 열기</a></header>" + statsRow() +
    '<section aria-labelledby="list-title"><h2 id="list-title" class="sr">스터디 목록</h2>' +
    '<div class="filters">' + search + mine + '<div class="row" role="group" aria-labelledby="f-view-l"><span class="label t-label1" id="f-view-l">보기</span>' + toggles + "</div></div>" +
    '<div class="count-row"><p class="count t-label1" id="count" role="status" aria-atomic="true">' + countText(list.length) + "</p>" + syncBtn("목록 새로 고침") + "</div>" +
    '<div id="results">' + listBody(list) + "</div></section>";
}

// ---------- 스터디 열기 ----------
const emptyDraft = () => ({ title: "", days: [], times: [], mode: "", capacity: String(R.MAX_CAPACITY), goal: "", deadline: "", startDate: "", endDate: "", tags: null }); // tags: null이면 아직 안 채움 → 내 프로필 태그로 채워요
let draft = emptyDraft();
let derrors = {};

function viewNew() {
  const m = me();
  if (draft.tags === null && m) draft.tags = R.tagsOf(m).slice(); // 새 초안에는 내 프로필 태그를 미리 넣어요
  const err = (k) => (derrors[k] ? '<p class="err t-caption1" id="err-' + k + '">' + esc(derrors[k]) + "</p>" : "");
  const desc = (k) => ' aria-describedby="hint-' + k + (derrors[k] ? " err-" + k : "") + '"' + (derrors[k] ? ' aria-invalid="true"' : "");
  const gdesc = (k) => ' aria-describedby="hint-' + k + (derrors[k] ? " err-" + k : "") + '"';
  const profileBox = m ? '<p class="note t-label1" style="margin-bottom:var(--spacing-16)">모집자: <b>' + esc(m.name) + "</b> · " + R.ROLE_LABEL[m.role] + "</p>"
    : '<section class="card" aria-labelledby="pf-title" style="max-width:640px;margin-bottom:var(--spacing-24)"><h2 id="pf-title" class="t-headline1">' + (account() ? "먼저 이름과 직군을 정해 주세요" : "먼저 구글로 로그인해 주세요") + '</h2><p class="note t-caption1" style="margin-bottom:var(--spacing-12)">스터디를 연 사람(모집자)으로 이름과 직군이 보여요.</p>' + loginOrProfile("page") + "</section>";
  return '<header class="page-head"><a class="more t-label1" href="#/">' + ICON.back + '목록으로</a><h1 class="t-title1" style="margin-top:var(--spacing-8)">스터디 열기</h1><p>스터디 이름, 요일, 간단 목표를 적으면 다른 사람이 보고 신청해요.</p></header>' +
    profileBox +
    '<form class="form" id="studyForm" novalidate>' +
    '<div class="field"><label for="f-title">스터디 이름</label><input id="f-title" class="text" data-d="title" maxlength="40" value="' + esc(draft.title) + '"' + desc("title") + '><p class="hint t-caption1" id="hint-title">2~40자. 무엇을 공부하는지 이름에 담아요. 예: pandas로 CSV 분석해 보기</p>' + err("title") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-days"' + gdesc("days") + '><span class="label" id="l-days">진행 요일</span><div class="chips">' +
      R.DAYS.map((d) => '<button type="button" class="chip" data-pick="days" data-val="' + d + '" aria-pressed="' + draft.days.includes(d) + '">' + d + "</button>").join("") +
      '</div><p class="hint t-caption1" id="hint-days"><span id="perWeekLive" aria-live="polite">' + perWeekText(draft.days.length) + "</span></p>" + err("days") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-times"' + gdesc("times") + '><span class="label" id="l-times">진행 시간대 <span class="note t-caption1">(선택)</span></span><div class="chips" id="timeChips">' +
      timeChips("times", R.timesForDays(draft.days), draft.times, NEED_DAYS) +
      '</div><p class="hint t-caption1" id="hint-times">여러 개 골라도 돼요. 고르지 않으면 ‘시간은 모여서 정해요’로 보여요.</p>' + err("times") + "</div>" +
    '<div class="field" role="group" aria-labelledby="l-dates" aria-describedby="hint-dates"><span class="label" id="l-dates">일정 <span class="note t-caption1">(선택)</span></span><div class="dates">' +
      [["deadline", "모집 마감일", true], ["startDate", "스터디 시작일", false], ["endDate", "스터디 종료일", true]].map(([k, label, fromToday]) =>
        '<div class="field"><label for="f-' + k + '" class="t-label1">' + label + '</label><input type="date" id="f-' + k + '" class="text" data-d="' + k + '" value="' + esc(draft[k]) + '"' + (fromToday ? ' min="' + R.kstToday() + '"' : "") +
        (derrors[k] ? ' aria-invalid="true" aria-describedby="err-' + k + '"' : "") + ">" + err(k) + "</div>").join("") +
      '</div><p class="hint t-caption1" id="hint-dates">모집 마감일 당일까지 신청을 받고, 다음 날부터 자동으로 마감돼요. 비워 두면 모여서 정해요.</p></div>' +
    '<div class="field" role="group" aria-labelledby="l-mode"' + gdesc("mode") + '><span class="label" id="l-mode">진행 방식</span><div class="chips">' +
      R.MODES.map((x) => '<button type="button" class="chip" data-pick="mode" data-val="' + esc(x) + '" aria-pressed="' + (draft.mode === x) + '">' + esc(x) + "</button>").join("") +
      '</div><p class="hint t-caption1" id="hint-mode">온라인은 ZEP에서 만나고, 오프라인은 회의실을 예약해요.</p>' + err("mode") + "</div>" +
    '<div class="field"><label for="f-cap">정원 (모집자 포함)</label><select id="f-cap" class="select half" data-d="capacity"' + desc("capacity") + ">" +
      [2, 3, 4, 5, 6].filter((n) => n <= R.MAX_CAPACITY).map((n) => '<option value="' + n + '"' + (String(draft.capacity) === String(n) ? " selected" : "") + ">" + n + "명</option>").join("") +
      '</select><p class="hint t-caption1" id="hint-capacity">6명 이내를 권장해요.</p>' + err("capacity") + "</div>" +
    '<div class="field"><label for="f-goal">간단 목표</label><input id="f-goal" class="text" data-d="goal" maxlength="80" value="' + esc(draft.goal) + '"' + desc("goal") + '><p class="hint t-caption1" id="hint-goal">5~80자. 예: 공공데이터 CSV를 읽어 필터·정렬·집계까지 직접 해 보기</p>' + err("goal") + "</div>" +
    tagField("study", "f", draft.tags || [], derrors.tags) +
    '<div class="actions"><button class="btn btn-primary" type="submit">' + ICON.add + '스터디 열기</button><a class="btn btn-outline" href="#/">취소</a></div>' +
    "</form>";
}

// ---------- 스터디 상세 ----------
function nextSteps(s) {
  return '<section class="card next" aria-labelledby="next-title"><h2 id="next-title" class="t-headline1" tabindex="-1">' + ICON.flag.replace('class="mi"', 'class="mi" style="vertical-align:-4px;margin-right:4px"') + "결성 다음 할 일</h2><ol class=\"t-body2\">" +
    "<li>슬랙 채널을 만들고 함께하는 사람을 모두 초대해요.</li>" +
    "<li>" + (s.startDate ? md(s.startDate) + "부터 진행해요. " : "") + "이 스터디는 " + metaLine(s) + "예요." + (s.endDate ? " " + md(s.endDate) + "에 끝나요." : "") + "</li>" +
    "<li>주 1회 이상 '10월 ○○팀 스터디 쓰레드'에 인증 사진과 문서화를 남겨요. ZEP은 캠을 켜고 캡처해요.</li>" +
    '<li>오프라인으로 만날 때는 <a href="https://wantedground.vercel.app/" target="_blank" rel="noopener noreferrer">회의실 예약' + ICON.open.replace('class="mi"', 'class="mi" style="width:16px;height:16px;vertical-align:-3px"') + '<span class="sr">(새 창)</span></a>을 해요.</li>' +
    "</ol></section>";
}

// 겹침 요약(모집자만): 시간대마다 가능하다고 한 수락된 사람·대기 중인 사람 수. 진행 시간대는 파랗게, 아무도 안 고른 시간대는 흐리게 보여요
function overlapBox(s) {
  const sum = R.timeSummary(s, S.apps);
  if (!sum.length) return "";
  return '<div class="overlap"><span class="t-label1" style="font-weight:600">가능한 시간대 겹침</span>' +
    '<ul class="mix" aria-label="시간대마다 가능한 사람 수">' + sum.map((x) => '<li><span class="tag' + ((s.times || []).includes(x.time) ? " tag-brand" : x.accepted || x.pending ? "" : " zero") + '">' + esc(x.time) + " " + x.accepted + "명" + (x.pending ? " · 대기 " + x.pending : "") + "</span></li>").join("") + "</ul>" +
    '<p class="note t-caption1">숫자는 수락한 사람이고, 대기 중인 사람은 따로 셌어요. ' + ((s.times || []).length ? "파란 칸이 진행 시간대예요." : "진행 시간대는 아직 정하지 않았어요.") + "</p></div>";
}

// 모집자 칸: 대기 신청 수락·거절, 마감·다시 열기, 모집 취소
function leaderBox(s) {
  const head = '<section class="card" aria-labelledby="pend-title"><h2 id="pend-title" class="t-headline1" tabindex="-1">신청한 사람';
  if (s.canceled) return head + '</h2><p class="note t-body2">취소한 스터디라 신청을 더 받지 않아요.</p></section>';
  const pending = S.apps.filter((a) => a.studyId === s.id && a.status === "pending");
  const full = R.seatsLeft(s, S.apps, S.people) === 0;
  let html = head + ' <span class="t-label1 note" aria-live="polite">대기 ' + pending.length + "명</span></h2>" + overlapBox(s) +
    (full && pending.length ? '<p class="note t-caption1">정원이 다 차서 더 수락할 수 없어요. 거절하거나 그대로 둘 수 있어요.</p>' : "") +
    (pending.length ? '<ul class="rows">' + pending.map((a) => { const p = person(a.personId); if (!p) return ""; return '<li><div class="who"><b>' + esc(p.name) + ' <span class="tag">' + R.ROLE_LABEL[p.role] + "</span></b><small>" + (a.message ? esc(a.message) : "남긴 말 없음") + "</small><small>" + timesSmall(a) + "</small>" + (R.tagsOf(p).length ? "<small>" + R.tagsOf(p).map(hashText).join(" ") + "</small>" : "") + "</div>" +
      '<div class="actions"><button type="button" class="btn btn-primary btn-sm" data-act="accept" data-app="' + esc(a.id) + '"' + (full ? " disabled" : "") + ' aria-label="' + esc(p.name) + '님 수락">수락</button><button type="button" class="btn btn-outline btn-sm" data-act="reject" data-app="' + esc(a.id) + '" aria-label="' + esc(p.name) + '님 거절">거절</button></div></li>'; }).join("") + "</ul>"
      : '<p class="note t-body2">아직 대기 중인 신청이 없어요.</p>');
  if (s.closed || closedByDate(s)) {
    const re = check(() => R.reopenStudy(s, S.apps, S.people, s.leaderId));
    const why = closedByDate(s) ? "모집 마감일(" + md(s.deadline) + ")이 지나 신청을 받지 않아요. " : "모집을 마감했어요. ";
    html += '<p class="note t-caption1" style="margin-top:var(--spacing-12)">' + why + (re.ok ? (closedByDate(s) ? "다시 열면 마감일을 지우고 새 신청을 받아요." : "다시 열면 새 신청을 받아요.") : esc(re.reason)) + "</p>" +
      (re.ok ? '<div class="actions" style="margin-top:var(--spacing-8)"><button type="button" class="btn btn-outline btn-sm" data-act="reopen" data-study="' + esc(s.id) + '">' + ICON.replay + "다시 열기</button></div>" : "");
  } else {
    html += '<div class="actions" style="margin-top:var(--spacing-16)">' + syncBtn("새 신청 불러오기") + '<button type="button" class="btn btn-outline btn-sm" data-act="close" data-study="' + esc(s.id) + '">모집 마감하기</button></div>';
  }
  return html + '<div class="danger-zone"><hr class="divider"><div><b class="t-label1">모집 취소</b><p class="note t-caption1">목록에서 내리고 신청을 더 받지 않아요. 함께하기로 한 사람에게는 ‘취소됨’으로 보여요. 되돌릴 수 없어요.</p></div>' +
    '<button type="button" class="btn btn-danger btn-sm" data-act="cancel-study" data-study="' + esc(s.id) + '">' + ICON.block + "모집 취소하기</button></div></section>";
}

// 신청할 때 고르는 내가 가능한 시간대 (다른 스터디로 옮기면 비워요)
let atimes = { id: "", list: [] };
const timesSmall = (a) => (a.times && a.times.length ? "가능: " + esc(a.times.join("·")) : "가능한 시간대 안 고름");

// 신청자 칸: 신청하기, 내 신청 상태, 대기 중이면 신청 취소
function applyBox(s, m) {
  if (atimes.id !== s.id) atimes = { id: s.id, list: [] };
  const mine = m ? R.myApplication(s, S.apps, m.id) : null;
  const can = R.canApply(s, S.apps, S.people, m ? m.id : null);
  let box = '<section class="card" aria-labelledby="apply-title"><h2 id="apply-title" class="t-headline1" tabindex="-1">신청하기</h2>';
  if (mine) box += '<p class="t-body2" style="margin:0 0 var(--spacing-12)">내 신청 <span class="tag status-' + mine.status + '">' + STATUS[mine.status] + "</span>" + (mine.status === "pending" || mine.status === "accepted" ? (mine.message ? '<br><small class="note">' + esc(mine.message) + "</small>" : "") + '<br><small class="note">' + timesSmall(mine) + "</small>" : "") + "</p>";
  if (can.ok) {
    box += '<form id="applyForm" class="form compact" data-study="' + esc(s.id) + '" novalidate><div class="field"><label for="f-msg">한 줄 메시지 (선택)</label><input id="f-msg" class="text" maxlength="80" aria-describedby="hint-msg" placeholder="예: 차트 화면을 맡아 볼게요"><p class="hint t-caption1" id="hint-msg">80자 안으로 적어요. 모집자에게 보여요.</p></div>' +
      '<div class="field" role="group" aria-labelledby="l-atimes" aria-describedby="hint-atimes"><span class="label" id="l-atimes">내가 가능한 시간대 <span class="note t-caption1">(선택)</span></span><div class="chips">' +
      timeChips("atimes", R.timesForDays(s.days), atimes.list, "이 스터디는 고를 수 있는 시간대가 없어요.") +
      '</div><p class="hint t-caption1" id="hint-atimes">여러 개 골라도 돼요. 모집자가 모일 시간을 정할 때 참고해요.' + (s.times && s.times.length ? " 이 스터디는 " + esc(s.times.join("·")) + "에 모여요." : "") + "</p></div>" +
      '<div class="actions"><button class="btn btn-primary" type="submit">' + (mine && ["rejected", "withdrawn", "left"].includes(mine.status) ? "다시 신청하기" : "신청하기") + "</button></div></form>";
  } else {
    box += '<p class="note t-body2" style="margin:0">' + esc(can.reason) + "</p>";
    if (!m) box += '<div class="actions" style="margin-top:var(--spacing-12)"><button type="button" class="btn btn-primary btn-sm" data-act="open-me">' + (account() ? "이름과 직군 정하기" : "구글로 로그인") + "</button></div>";
    else if (mine && mine.status === "pending" && !s.canceled) {
      box += '<div class="actions" style="margin-top:var(--spacing-12)">' + syncBtn("내 신청 상태 새로 고침") + '<button type="button" class="btn btn-outline btn-sm" data-act="withdraw" data-app="' + esc(mine.id) + '">신청 취소하기</button></div>';
    } else if (mine && mine.status === "accepted" && !s.canceled) {
      box += '<div class="actions" style="margin-top:var(--spacing-12)"><button type="button" class="btn btn-outline btn-sm" data-act="leave" data-app="' + esc(mine.id) + '">스터디 나가기</button></div>';
    }
  }
  return box + "</section>";
}

// 모집자가 함께하는 사람을 내보내는 버튼 (모집자 자신과 취소된 스터디에는 없어요)
function kickBtn(s, p, isLeader) {
  if (!isLeader || s.canceled || p.id === s.leaderId) return "";
  const a = S.apps.find((x) => x.studyId === s.id && x.personId === p.id && x.status === "accepted");
  return a ? '<button type="button" class="btn btn-outline btn-sm" data-act="remove-member" data-app="' + esc(a.id) + '" aria-label="' + esc(p.name) + '님 내보내기">내보내기</button>' : "";
}

function viewDetail(id) {
  const s = study(id);
  if (!s) return '<div class="sec"><div class="empty">찾는 스터디가 없어요. 주소를 확인해 주세요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><a class="btn btn-outline btn-sm" href="#/">스터디 목록</a><a class="btn btn-primary btn-sm" href="#/new">스터디 열기</a></div></div></div>';
  const m = me();
  const leader = person(s.leaderId);
  const isLeader = !!m && R.canManage(s, m.id).ok;
  const list = R.members(s, S.apps, S.people);
  const open = R.isOpen(s, S.apps, S.people);
  const mix = R.roleMix(s, S.apps, S.people);

  const membersBox = '<section class="card" aria-labelledby="mem-title"><h2 id="mem-title" class="t-headline1">' + (s.canceled ? "함께하기로 했던 사람" : "함께하는 사람") + "</h2>" +
    (s.canceled ? "" : seatsBar(s)) +
    '<ul class="rows">' + list.map((p) => '<li><div class="who"><b>' + esc(p.name) + (m && p.id === m.id ? ' <span class="t-caption1 note">(나)</span>' : "") + '</b></div><div class="actions">' +
      (p.id === s.leaderId ? '<span class="tag tag-brand">모집자</span>' : "") + '<span class="tag">' + R.ROLE_LABEL[p.role] + "</span>" + kickBtn(s, p, isLeader) + "</div></li>").join("") + "</ul>" +
    '<div style="display:grid;gap:var(--spacing-6);margin-top:var(--spacing-8)"><span class="t-label1" style="font-weight:600">직군 구성</span>' + mixRow(s) +
    (mix.missing.length && open ? '<p class="note t-caption1">비개발 직군은 화면 기획·프롬프트를, 개발 직군은 서버·코드를 맡아 함께 만들 수 있어요.</p>' : "") + "</div></section>";

  let side = isLeader ? leaderBox(s) : applyBox(s, m);
  if (!open && !s.canceled) side += nextSteps(s);

  // 취소된 스터디: 주소로 들어온 사람(함께하던 사람 포함)에게 무슨 일이 있었는지와 할 수 있는 일을 알려 줘요
  const canceledNote = s.canceled ? '<div class="notice" role="note">' + ICON.info + '<div><b id="cancel-title" tabindex="-1">' + (isLeader ? "이 스터디 모집을 취소했어요." : "모집자가 이 스터디를 취소했어요.") + "</b>" +
    '<p class="t-caption1">' + (isLeader ? "다른 사람 목록에서 빠졌고 신청을 더 받지 않아요. 함께하기로 한 사람에게는 ‘취소됨’으로 보여요." : "신청과 수락을 더 받지 않아요. 다른 스터디를 찾아 신청해 보세요.") + "</p>" +
    '<a class="btn btn-outline btn-sm" href="' + (isLeader ? "#/new" : "#/") + '">' + (isLeader ? ICON.add + "새 스터디 열기" : "스터디 목록") + "</a></div></div>" : "";

  return '<header class="page-head"><a class="more t-label1" href="#/">' + ICON.back + '목록으로</a>' +
    '<div class="actions" style="margin-top:var(--spacing-12)">' + statusTag(s) + dueTag(s) + "</div>" +
    '<h1 class="t-title1" style="margin-top:var(--spacing-8)">' + esc(s.title) + "</h1>" +
    (R.tagsOf(s).length ? '<div class="study-tags detail-tags" role="group" aria-label="해시태그">' + R.tagsOf(s).map((t) => '<button type="button" class="tag tag-btn" data-tagjump="' + esc(t) + '" aria-label="' + hashText(t) + ' 태그로 목록에서 찾기">' + hashText(t) + "</button>").join("") + "</div>" : "") +
    "<p>" + metaLine(s) + (dateLine(s) ? " · " + dateLine(s) : "") + " · 모집자 " + (leader ? esc(leader.name) + "(" + R.ROLE_LABEL[leader.role] + ")" : "탈퇴한 사람") + "</p>" +
    '<div class="goal-box t-body2"><b>목표</b> ' + esc(s.goal) + "</div>" + canceledNote + "</header>" +
    '<div class="two">' + membersBox + '<div class="stack">' + side + "</div></div>";
}

// ---------- 내 스터디 ----------
function viewMy() {
  const m = me();
  const head = '<header class="page-head"><h1 class="t-title1">내 스터디</h1><p>내가 연 스터디와 신청한 스터디를 모아 봐요.</p></header>';
  if (!m) return head + '<div class="empty">내 스터디를 보려면 먼저 구글로 로그인해 주세요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><button type="button" class="btn btn-primary btn-sm" data-act="open-me">구글로 로그인</button><a class="btn btn-outline btn-sm" href="#/">스터디 둘러보기</a></div></div>';

  const opened = R.sortStudies(S.studies.filter((s) => s.leaderId === m.id), S.apps, S.people);
  const applied = S.studies.map((s) => ({ s, a: R.myApplication(s, S.apps, m.id) })).filter((x) => x.a && x.s.leaderId !== m.id);

  // 내가 연 스터디: 목록에서 바로 마감하거나 다시 열어요 (모집 취소는 되돌릴 수 없어서 상세 화면에서만 해요)
  const rowAction = (s) => {
    const st = R.studyStatus(s, S.apps, S.people), name = esc(s.title);
    if (st === "open" || st === "full") return '<button type="button" class="btn btn-outline btn-sm" data-act="close" data-study="' + esc(s.id) + '" aria-label="' + name + ' 모집 마감하기">마감하기</button>';
    if (st === "closed" && check(() => R.reopenStudy(s, S.apps, S.people, m.id)).ok) return '<button type="button" class="btn btn-outline btn-sm" data-act="reopen" data-study="' + esc(s.id) + '" aria-label="' + name + ' 다시 열기">' + ICON.replay + "다시 열기</button>";
    return "";
  };
  const openedBox = '<section class="sec" aria-labelledby="opened-title"><div class="sec-head"><h2 id="opened-title" class="t-title3" tabindex="-1">내가 연 스터디</h2><a class="btn btn-primary btn-sm" href="#/new">' + ICON.add + "스터디 열기</a></div>" +
    (opened.length ? '<ul class="rows card">' + opened.map((s) => {
      const pend = s.canceled ? 0 : S.apps.filter((a) => a.studyId === s.id && a.status === "pending").length;
      return '<li><div class="who"><a href="#/s/' + encodeURIComponent(s.id) + '">' + esc(s.title) + '</a><small>' + metaLine(s) + (dateLine(s) ? " · " + dateLine(s) : "") + " · " + R.members(s, S.apps, S.people).length + "/" + s.capacity + "명</small></div>" +
        '<div class="actions">' + (pend ? '<span class="tag tag-brand" style="font-weight:600">대기 ' + pend + "명</span>" : "") + statusTag(s) + rowAction(s) + "</div></li>";
    }).join("") + "</ul>"
      : '<div class="empty">아직 연 스터디가 없어요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><a class="btn btn-primary btn-sm" href="#/new">스터디 열기</a></div></div>') + "</section>";

  // 신청한 스터디: 대기 중이면 여기서 바로 신청을 취소해요. 모집자가 취소한 스터디는 "스터디 취소됨"으로 보여요.
  const appliedBox = '<section class="sec" aria-labelledby="applied-title" style="padding-top:0"><div class="sec-head"><h2 id="applied-title" class="t-title3" tabindex="-1">신청한 스터디</h2></div>' +
    (applied.length ? '<ul class="rows card">' + applied.map(({ s, a }) => '<li><div class="who"><a href="#/s/' + encodeURIComponent(s.id) + '">' + esc(s.title) + "</a><small>" + metaLine(s) + (s.canceled ? " · 모집자가 취소했어요" : a.status === "removed" ? " · 모집자가 내보냈어요" : "") + "</small></div>" +
      '<div class="actions">' + appTag(s, a) + (a.status === "pending" && !s.canceled ? '<button type="button" class="btn btn-outline btn-sm" data-act="withdraw" data-app="' + esc(a.id) + '" aria-label="' + esc(s.title) + ' 신청 취소하기">신청 취소</button>' : "") +
        (a.status === "accepted" && !s.canceled ? '<button type="button" class="btn btn-outline btn-sm" data-act="leave" data-app="' + esc(a.id) + '" aria-label="' + esc(s.title) + ' 나가기">나가기</button>' : "") + "</div></li>").join("") + "</ul>"
      : '<div class="empty">아직 신청한 스터디가 없어요.<div class="actions" style="justify-content:center;margin-top:var(--spacing-12)"><a class="btn btn-outline btn-sm" href="#/">스터디 둘러보기</a></div></div>') + "</section>";

  return head + '<p class="note t-label1">' + esc(m.name) + " · " + R.ROLE_LABEL[m.role] + "</p>" + openedBox + appliedBox;
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
window.addEventListener("hashchange", () => {
  if (!S) return;
  closePanel(false); closeNotes(false); route(); app.focus({ preventScroll: true }); scrollTo(0, 0);
  readOpenStudy();
  syncState();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") syncState().then((synced) => { if (!synced) loadNotes(); });
});

meBtn.addEventListener("click", () => (mePanel.hidden ? openPanel() : closePanel(true)));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || document.getElementById("confirmDlg").open) return;
  if (!mePanel.hidden) closePanel(true);
  if (!notePanel.hidden) closeNotes(true);
});
document.addEventListener("click", (e) => {
  if (!mePanel.hidden && !mePanel.contains(e.target) && !meBtn.contains(e.target) && !e.target.closest('[data-act="open-me"]')) closePanel(false);
  if (!notePanel.hidden && !notePanel.contains(e.target) && !noteBtn.contains(e.target)) closeNotes(false);
  const a = e.target.closest("a[data-note]"); // 알림을 누르면 읽음으로 바꾸고 그 스터디로 가요
  if (a) { readNotes([a.dataset.note]); closeNotes(false); }
});
noteBtn.addEventListener("click", () => (notePanel.hidden ? openNotes() : closeNotes(true)));
// 해시태그 입력칸: Enter·쉼표로 더하고, 빈 칸에서 Backspace로 마지막 태그를 빼요. 한글을 조합하는 중에 누른 키는 건드리지 않아요.
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (!t.dataset || t.dataset.taginput === undefined || e.isComposing || e.keyCode === 229) return;
  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); flushTagInput(t); }
  else if (e.key === "Backspace" && !t.value && !e.repeat) { // 글자를 지우려고 길게 누른 Backspace가 칩까지 줄줄이 지우지 않게, 한 번 누를 때만 빼요
    const field = t.closest("[data-tagfield]"), n = tagListOf(field.dataset.tagfield).length;
    if (n) { e.preventDefault(); removeTagAt(field, n - 1); }
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset && e.target.dataset.d) draft[e.target.dataset.d] = e.target.value;
});
let searchTimer = 0;
document.addEventListener("input", (e) => {
  const d = e.target.dataset || {};
  if (d.d) draft[d.d] = e.target.value;
  if (d.pf === "name") pdraft.name = e.target.value;
  if (d.taginput !== undefined && /[,，]/.test(e.target.value) && !e.isComposing) flushTagInput(e.target); // 쉼표를 치거나 붙여넣으면 바로 나눠요
  if (d.search !== undefined) {
    filter.q = e.target.value;
    clearTimeout(searchTimer); searchTimer = setTimeout(updateResults, 120); // 한 글자마다 개수를 읽어 주지 않게 잠깐 모아요
  }
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  try {
    if (b.dataset.act === "reload") { boot(); return; }
    if (b.dataset.act === "open-me") { openPanel(); return; }

    // 목록의 해시태그(카드·내 해시태그 칩): 검색어에 넣거나 빼요. 카드 태그는 다시 그려지니까 검색창으로 포커스를 옮겨요
    if (b.dataset.tagq !== undefined) { setQuery(R.toggleTagInQuery(filter.q, b.dataset.tagq), !!b.closest(".study")); return; }
    // 상세의 해시태그: 목록으로 가서 그 태그로 찾아요
    if (b.dataset.tagjump !== undefined) { filter.q = "#" + b.dataset.tagjump; location.hash = "#/"; return; }

    // 해시태그 입력칸의 칩 빼기·많이 쓰는 태그 더하기 (칩 줄만 다시 그려요)
    if (b.dataset.tagdel !== undefined) { removeTagAt(b.closest("[data-tagfield]"), Number(b.dataset.tagdel)); return; }
    if (b.dataset.tagadd !== undefined) {
      const field = b.closest("[data-tagfield]");
      addTagsTo(field, [b.dataset.tagadd]);
      field.querySelector("[data-taginput]").focus();
      return;
    }

    // 폼 안 칩: 화면을 다시 그리지 않고 눌림 상태만 바꿔요 (입력 중인 글과 포커스가 그대로 남아요)
    if (b.dataset.pick) {
      const g = b.dataset.pick, v = b.dataset.val, box = b.parentElement;
      if (g === "days" || g === "times" || g === "atimes") {
        const list = g === "atimes" ? atimes.list : draft[g];
        const i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1); else list.push(v);
        b.setAttribute("aria-pressed", String(i < 0));
        if (g === "days") {
          const live = document.getElementById("perWeekLive"); if (live) live.textContent = perWeekText(draft.days.length);
          // 요일이 바뀌면 맞지 않는 시간대는 빼고, 고를 수 있는 시간대 칩을 다시 그려요 (누른 요일 칩의 포커스는 그대로예요)
          const fit = R.timesForDays(draft.days);
          draft.times = draft.times.filter((t) => fit.includes(t));
          const tc = document.getElementById("timeChips"); if (tc) tc.innerHTML = timeChips("times", fit, draft.times, NEED_DAYS);
        }
        return;
      }
      if (g === "prole") pdraft.role = v; else draft[g] = v;
      box.querySelectorAll("[data-pick]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      return;
    }

    if (b.dataset.toggle) { filter[b.dataset.toggle] = !filter[b.dataset.toggle]; rerender('[data-toggle="' + b.dataset.toggle + '"]'); return; }
    if (b.dataset.act === "clear-filters") { filter = { q: "", openOnly: false, needMine: false }; rerender("#f-q"); toast("검색어와 필터를 지웠어요."); return; }

    if (b.dataset.act === "sync") {
      run(b, "불러오는 중…", async () => {
        await loadState();
        refresh('[data-act="sync"]');
        toast("최신 내용을 불러왔어요.");
      });
      return;
    }
    if (b.dataset.act === "accept" || b.dataset.act === "reject") {
      const a = S.apps.find((x) => x.id === b.dataset.app);
      const p = a && person(a.personId);
      if (!a) return;
      const status = b.dataset.act === "accept" ? "accepted" : "rejected";
      run(b, status === "accepted" ? "수락하는 중…" : "거절하는 중…", async () => {
        await api("PATCH", "apps/" + encodeURIComponent(a.id), { status });
        refresh("#pend-title");
        const s = study(a.studyId);
        const full = !!s && R.seatsLeft(s, S.apps, S.people) === 0;
        toast((p ? p.name + "님 신청을 " : "신청을 ") + (status === "accepted" ? "수락했어요." : "거절했어요.") + (status === "accepted" && full ? " 정원이 찼어요. 결성 다음 할 일을 확인해요." : ""));
      });
      return;
    }
    const onMy = () => (location.hash || "#/").split("/")[1] === "my";
    if (b.dataset.act === "close") {
      const s = study(b.dataset.study);
      if (!s) return;
      confirmBox({ title: "모집을 마감할까요?", body: "‘" + s.title + "’ 모집을 마감하면 새 신청을 받지 않아요. 마감한 뒤에도 다시 열 수 있어요.", ok: "마감하기" }).then((yes) => {
        if (!yes) return;
        run(b, "마감하는 중…", async () => {
          await api("PATCH", "studies/" + encodeURIComponent(s.id), { closed: true });
          refresh(onMy() ? "#opened-title" : "#next-title");
          toast(onMy() ? "‘" + s.title + "’ 모집을 마감했어요." : "모집을 마감했어요. 슬랙 채널을 만들어 시작해요.");
        });
      });
      return;
    }
    if (b.dataset.act === "reopen") {
      const s = study(b.dataset.study);
      if (!s) return;
      const byDate = closedByDate(s);
      run(b, "여는 중…", async () => {
        await api("PATCH", "studies/" + encodeURIComponent(s.id), { closed: false });
        refresh(onMy() ? "#opened-title" : "#pend-title");
        toast("‘" + s.title + "’ 모집을 다시 열었어요. " + (byDate ? "지난 마감일은 지웠어요." : "새 신청을 받아요."));
      });
      return;
    }
    if (b.dataset.act === "cancel-study") {
      const s = study(b.dataset.study);
      if (!s) return;
      const joined = R.members(s, S.apps, S.people).length - 1;
      const waiting = S.apps.filter((a) => a.studyId === s.id && a.status === "pending").length;
      const who = [joined ? "함께하기로 한 " + joined + "명" : "", waiting ? "대기 중인 " + waiting + "명" : ""].filter(Boolean).join("과 ");
      confirmBox({
        title: "‘" + s.title + "’ 모집을 취소할까요?",
        body: "목록에서 내리고 신청을 더 받지 않아요. " + (who ? who + "에게는 ‘취소됨’으로 보여요. " : "") + "취소하면 되돌릴 수 없어요.",
        ok: "모집 취소하기", danger: true,
      }).then((yes) => {
        if (!yes) return;
        run(b, "취소하는 중…", async () => {
          await api("PATCH", "studies/" + encodeURIComponent(s.id), { canceled: true });
          refresh("#cancel-title");
          toast("모집을 취소했어요. 다른 사람 목록에서 빠졌어요.");
        });
      });
      return;
    }
    if (b.dataset.act === "leave") {
      const a = S.apps.find((x) => x.id === b.dataset.app);
      const s = a && study(a.studyId);
      if (!s) return;
      confirmBox({ title: "‘" + s.title + "’에서 나갈까요?", body: "함께하는 사람에서 빠지고 자리가 하나 비어요. 나중에 다시 신청할 수 있지만, 모집자가 다시 수락해야 해요.", ok: "스터디 나가기", danger: true }).then((yes) => {
        if (!yes) return;
        run(b, "나가는 중…", async () => {
          await api("PATCH", "apps/" + encodeURIComponent(a.id), { status: "left" });
          refresh(onMy() ? "#applied-title" : "#apply-title");
          toast("‘" + s.title + "’에서 나왔어요. 마음이 바뀌면 다시 신청할 수 있어요.");
        });
      });
      return;
    }
    if (b.dataset.act === "remove-member") {
      const a = S.apps.find((x) => x.id === b.dataset.app);
      const p = a && person(a.personId);
      if (!a || !p) return;
      confirmBox({ title: p.name + "님을 내보낼까요?", body: "함께하는 사람에서 빠지고 정원 한 자리가 비어요. 내보낸 사람은 이 스터디에 다시 신청할 수 없어요. 되돌릴 수 없어요.", ok: "내보내기", danger: true }).then((yes) => {
        if (!yes) return;
        run(b, "내보내는 중…", async () => {
          await api("PATCH", "apps/" + encodeURIComponent(a.id), { status: "removed" });
          refresh("#pend-title");
          toast(p.name + "님을 내보냈어요. 자리가 하나 비었어요.");
        });
      });
      return;
    }
    if (b.dataset.act === "withdraw") {
      const a = S.apps.find((x) => x.id === b.dataset.app);
      const s = a && study(a.studyId);
      if (!s) return;
      confirmBox({ title: "‘" + s.title + "’ 신청을 취소할까요?", body: "모집자 화면에서 내 신청이 빠져요. 나중에 다시 신청할 수 있어요.", ok: "신청 취소하기", danger: true }).then((yes) => {
        if (!yes) return;
        run(b, "취소하는 중…", async () => {
          await api("PATCH", "apps/" + encodeURIComponent(a.id), { status: "withdrawn" });
          refresh(onMy() ? "#applied-title" : "#apply-title");
          toast("신청을 취소했어요. 마음이 바뀌면 다시 신청할 수 있어요.");
        });
      });
      return;
    }
    if (b.dataset.act === "push-check") { checkPush(); return; }
    if (b.dataset.act === "notes-retry") { loadNotes(); return; }
    if (b.dataset.act === "notes-read-all") { readNotes("all"); toast("알림을 모두 읽음으로 바꿨어요."); return; }
    if (b.dataset.act === "push-on") {
      run(b, "켜는 중…", async () => {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { await checkPush(); toast(perm === "denied" ? "알림이 막혔어요. 브라우저 설정에서 허용해 주세요." : "알림을 켜지 않았어요."); return; }
        let sub;
        try {
          const reg = await navigator.serviceWorker.register("/sw.js");
          await navigator.serviceWorker.ready;
          sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
        } catch (err) { throw new Error("이 브라우저에서 알림을 켜지 못했어요. 크롬·엣지·파이어폭스에서 다시 해 보세요."); }
        await api("POST", "push", { subscription: sub.toJSON() });
        await checkPush();
        toast("이 기기에서 알림을 받아요.");
      });
      return;
    }
    if (b.dataset.act === "delete-account") {
      const m = me();
      if (!m) return;
      const n = R.accountImpact(S, m.id);
      confirmBox({
        title: "정말 탈퇴할까요?",
        body: (n.studies ? "내가 연 스터디 " + n.studies + "개는 모집 취소되고, 함께하던 사람에게 알림이 가요. " : "") +
          (n.apps ? "내 신청 " + n.apps + "개는 신청 취소(수락된 스터디는 나감)로 바뀌어요. " : "") +
          "이름·직군·알림은 바로 지워지고 되돌릴 수 없어요. 같은 구글 계정으로 다시 가입하면 처음부터 시작해요.",
        ok: "탈퇴하기", danger: true,
      }).then((yes) => {
        if (!yes) return;
        run(b, "탈퇴하는 중…", async () => {
          await api("DELETE", "me"); // 서버가 프로필·구독·알림함을 지우고 바뀐 목록(state)을 돌려줘요
          const sub = canPush() ? await pushSub().catch(() => null) : null;
          if (sub) await sub.unsubscribe().catch(() => {}); // 이 기기 알림도 끊어요
          saveAuth(null); expired = false; pdraft = emptyP(); perrors = {}; pushState = ""; notes = null;
          try { window.google.accounts.id.disableAutoSelect(); } catch (err) { /* 구글 스크립트가 없어도 탈퇴는 끝났어요 */ }
          closeNotes(false); closePanel(false);
          renderMe(); // 오른쪽 위 버튼을 "로그인"으로 바꿔요 (주소를 옮겨도 프로필 버튼은 다시 그리지 않아서요)
          if (location.hash && location.hash !== "#/") location.hash = "#/"; else refresh();
          toast("탈퇴했어요. 그동안 함께해 줘서 고마워요.");
        });
      });
      return;
    }
    if (b.dataset.act === "push-off") {
      run(b, "끄는 중…", async () => {
        const sub = await pushSub();
        if (sub) {
          // 서버에서 못 지워도 괜찮아요: 브라우저 구독을 끊으면 다음 알림 때 서버가 사라진 구독(410)으로 보고 지워요
          await api("DELETE", "push", { endpoint: sub.endpoint }).catch(() => {});
          await sub.unsubscribe();
        }
        await checkPush();
        toast("이 기기 알림을 껐어요.");
      });
      return;
    }
    if (b.dataset.act === "logout") {
      run(b, "로그아웃하는 중…", async () => {
        // 같은 기기를 다른 사람이 쓸 수 있어서, 로그아웃하면 이 기기 알림도 꺼요
        const sub = canPush() ? await pushSub().catch(() => null) : null;
        if (sub) { await api("DELETE", "push", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
        saveAuth(null); expired = false; pdraft = emptyP(); perrors = {}; pushState = ""; notes = null; closeNotes(false);
        try { window.google.accounts.id.disableAutoSelect(); } catch (err) { /* 구글 스크립트가 없어도 로그아웃돼요 */ }
        closePanel(false); refresh(); toast("로그아웃했어요.");
      });
      return;
    }
  } catch (err) { toast(err.message); }
});

// 서버가 칸마다 이유를 돌려주면(400) 그 칸 아래에 보여 줘요
const fieldErrors = (err) => (err.status === 400 && err.fields ? err.fields : null);
const submitBtn = (f) => f.querySelector('[type="submit"]');

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    // 해시태그 입력칸에 남은 글자도 태그로 더해요. 틀리면 저장하지 않고 그 칸으로 가요
    const ti = f.querySelector("[data-taginput]");
    if (ti && !flushTagInput(ti)) { ti.focus(); toast("해시태그를 확인해 주세요."); return; }
    if (f.dataset.form === "profile") {
      const p = { name: pdraft.name.trim(), role: pdraft.role, tags: pdraft.tags || [] };
      perrors = R.validateProfile(p);
      const ctx = f.dataset.ctx;
      const root = () => (ctx === "nav" ? mePanel : app);
      if (Object.keys(perrors).length) {
        refresh();
        toast("이름과 직군을 확인해 주세요.");
        focusFirstError(root());
        return;
      }
      if (!account()) { refresh(); toast("먼저 구글로 로그인해 주세요."); return; }
      const wasMe = !!me();
      run(submitBtn(f), "저장하는 중…", async () => {
        try { await api("PUT", "me", p); }
        catch (err) {
          if (!fieldErrors(err)) throw err;
          perrors = fieldErrors(err); refresh(); toast(err.message); focusFirstError(root());
          return;
        }
        pdraft = emptyP(); perrors = {};
        closePanel(false); refresh(); loadNotes();
        toast(wasMe ? "프로필을 고쳤어요." : p.name + "님, 반가워요. 이제 스터디를 열거나 신청할 수 있어요.");
        if (ctx === "nav") meBtn.focus();
      });
      return;
    }
    if (f.id === "studyForm") {
      const m = me();
      const s = { title: String(draft.title).trim(), days: R.DAYS.filter((d) => draft.days.includes(d)), times: R.TIMES.filter((t) => draft.times.includes(t)), mode: draft.mode, capacity: Number(draft.capacity), goal: String(draft.goal).trim(),
        deadline: draft.deadline || null, startDate: draft.startDate || null, endDate: draft.endDate || null, tags: draft.tags || [] };
      derrors = R.validateStudy(s, R.kstToday());
      if (Object.keys(derrors).length) { rerender(); toast("입력한 내용을 확인해 주세요."); focusFirstError(document.getElementById("studyForm")); return; }
      if (!m) { toast(account() ? "먼저 이름과 직군을 저장해 주세요." : "먼저 구글로 로그인해 주세요."); const g = app.querySelector("#pf-title"); if (g) g.scrollIntoView({ block: "center" }); return; }
      run(submitBtn(f), "여는 중…", async () => {
        let d;
        try { d = await api("POST", "studies", s); }
        catch (err) {
          if (!fieldErrors(err)) throw err;
          derrors = fieldErrors(err); rerender(); toast(err.message); focusFirstError(document.getElementById("studyForm"));
          return;
        }
        draft = emptyDraft(); derrors = {};
        location.hash = "#/s/" + encodeURIComponent(d.study.id);
        toast("스터디를 열었어요. 신청이 오면 여기에서 수락해요.");
      });
      return;
    }
    if (f.id === "applyForm") {
      const s = study(f.dataset.study);
      if (!s) return;
      if (!me()) { toast(account() ? "먼저 이름과 직군을 저장해 주세요." : "먼저 구글로 로그인해 주세요."); openPanel(); return; }
      const msg = (document.getElementById("f-msg") || {}).value || "";
      run(submitBtn(f), "신청하는 중…", async () => {
        await api("POST", "apps", { studyId: s.id, message: msg, times: R.TIMES.filter((t) => atimes.id === s.id && atimes.list.includes(t)) });
        atimes = { id: "", list: [] };
        refresh("#apply-title");
        toast("신청했어요. 모집자가 수락하면 함께해요.");
      });
    }
  } catch (err) { toast(err.message); }
});

boot();
