// 공지용 스터디 모집 규칙. 화면(recruit.js)·서버 함수(api/_lib/recruit.js)·테스트가 같이 써요.
// 구성원이 구글로 로그인해 스터디를 열고(이름·요일·목표) → 다른 사람이 신청하고 → 모집자가 수락하면 함께해요.
// 주제는 따로 고르지 않고 스터디 이름에 적어요.
// 모집자는 마감·다시 열기·모집 취소·내보내기를, 신청자는 대기 중인 신청 거두기와 수락된 뒤 스스로 나가기를 할 수 있어요.
// 취소·거두기는 지우지 않고 표시만 남겨요(study.canceled, application.status "withdrawn"). 함께하던 사람이 "취소됨"을 볼 수 있어요.

export const ROLES = [
  { key: "dev", label: "개발" },
  { key: "design", label: "디자인" },
  { key: "po", label: "PO" },
  { key: "marketing", label: "마케터" },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
export const MODES = ["ZEP 온라인", "오프라인"];
export const MAX_CAPACITY = 6; // 공지: 6명 이내 권장
// 시간대는 기획안 버전(v1/logic.js)과 같은 6개예요 (테스트가 같은지 확인해요). 자유 입력은 받지 않아요.
export const TIMES = ["평일 낮", "평일 저녁", "평일 밤", "주말 오전", "주말 오후", "주말 저녁"];
const WEEKEND = ["토", "일"];

// 고른 요일에 맞는 시간대: 평일(월~금)이 있으면 평일 셋, 주말(토·일)이 있으면 주말 셋
export function timesForDays(days = []) {
  const weekday = days.some((d) => DAYS.includes(d) && !WEEKEND.includes(d));
  const weekend = days.some((d) => WEEKEND.includes(d));
  return TIMES.filter((t) => (t.startsWith("평일") ? weekday : weekend));
}
// 시간대 검사: 안 골라도 돼요. 고르면 목록에 있고 요일에 맞아야 해요. 틀리면 이유, 맞으면 "" (서버도 써요)
export function validateTimes(times, days) {
  if (times == null) return "";
  if (!Array.isArray(times) || times.some((t) => !TIMES.includes(t))) return "시간대는 목록에서 골라 주세요.";
  const fit = timesForDays(days);
  if (times.some((t) => !fit.includes(t))) return "고른 요일에 맞는 시간대를 골라 주세요.";
  return "";
}
const orderTimes = (times) => TIMES.filter((t) => (times || []).includes(t));

// 일정: 모집 마감일(deadline)·스터디 시작일(startDate)·종료일(endDate). 모두 선택이고 "2026-10-25"처럼 한국 날짜로 저장해요.
// 오늘(today)을 바깥에서 받을 수 있게 해서 같은 입력이면 늘 같은 결과가 나와요. 안 주면 지금 한국 날짜를 써요.
export const kstToday = (now = Date.now()) => new Date(now + 9 * 3600000).toISOString().slice(0, 10);
const DATE_LABEL = { deadline: "모집 마감일", startDate: "스터디 시작일", endDate: "스터디 종료일" };
const filled = (v) => v != null && v !== "";
export const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
// 마감까지 남은 날: 오늘 마감이면 0, 지났으면 음수, 마감일이 없으면 null
export function daysLeft(study, today = kstToday()) {
  return isDate(study.deadline) ? Math.round((Date.parse(study.deadline) - Date.parse(today)) / 86400000) : null;
}
// 마감일 당일까지는 받고, 다음 날부터 마감이에요
const pastDeadline = (study, today) => isDate(study.deadline) && study.deadline < today;
const md = (d) => Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10));

// 스터디 등록 입력 검사: 틀린 칸마다 이유를 돌려줘요. today를 주면(새로 열 때) 지난 마감일·종료일도 막아요
export function validateStudy(s, today) {
  const e = {};
  const title = String(s.title || "").trim();
  if (title.length < 2 || title.length > 40) e.title = "스터디 이름을 2~40자로 적어 주세요.";
  // 주 횟수는 따로 받지 않고 고른 요일 수로 정해요
  const days = s.days || [];
  if (!days.length) e.days = "진행 요일을 하나 이상 골라 주세요.";
  else if (days.some((d) => !DAYS.includes(d))) e.days = "요일은 목록에서 골라 주세요.";
  const goal = String(s.goal || "").trim();
  if (goal.length < 5 || goal.length > 80) e.goal = "간단 목표를 5~80자로 적어 주세요.";
  // 진행 시간대는 안 골라도 돼요 (안 고르면 "시간은 모인 뒤 정해요")
  const te = validateTimes(s.times, Array.isArray(days) ? days : []);
  if (te) e.times = te;
  if (!MODES.includes(s.mode)) e.mode = "진행 방식을 골라 주세요.";
  // 일정(선택): 날짜 모양 → 순서(시작일 ≤ 종료일, 모집 마감일 ≤ 종료일) → 오늘이거나 뒤인지
  Object.keys(DATE_LABEL).forEach((k) => { if (filled(s[k]) && !isDate(s[k])) e[k] = DATE_LABEL[k] + "을 날짜로 골라 주세요."; });
  const d = (k) => (filled(s[k]) && !e[k] ? s[k] : "");
  if (d("startDate") && d("endDate") && d("startDate") > d("endDate")) e.endDate = "종료일은 시작일과 같거나 뒤여야 해요.";
  if (d("deadline") && d("endDate") && d("deadline") > d("endDate")) e.deadline = "모집 마감일은 종료일과 같거나 앞이어야 해요.";
  if (today && d("deadline") && !e.deadline && d("deadline") < today) e.deadline = "모집 마감일은 오늘이거나 뒤여야 해요.";
  if (today && d("endDate") && !e.endDate && d("endDate") < today) e.endDate = "종료일은 오늘이거나 뒤여야 해요.";
  const cap = Number(s.capacity);
  if (!Number.isInteger(cap) || cap < 2 || cap > MAX_CAPACITY) e.capacity = "정원은 2~" + MAX_CAPACITY + "명 사이로 골라 주세요.";
  return e;
}

export function validateProfile(p) {
  const e = {};
  const name = String(p.name || "").trim();
  if (name.length < 2 || name.length > 12) e.name = "보여 줄 이름을 2~12자로 적어 주세요.";
  if (!ROLE_LABEL[p.role]) e.role = "직군을 하나 골라 주세요.";
  return e;
}

// 함께하는 사람 = 모집자 + 수락된 신청자
export function members(study, apps, people) {
  const ids = [study.leaderId].concat(apps.filter((a) => a.studyId === study.id && a.status === "accepted").map((a) => a.personId));
  return ids.map((id) => people.find((p) => p.id === id)).filter(Boolean);
}
export function seatsLeft(study, apps, people) {
  return Math.max(0, study.capacity - members(study, apps, people).length);
}
export function isOpen(study, apps, people, today = kstToday()) {
  return !study.canceled && !study.closed && !pastDeadline(study, today) && seatsLeft(study, apps, people) > 0;
}
// 카드·목록에 보여 줄 상태: open 모집 중 · full 정원 마감 · closed 마감 · canceled 취소됨
export function studyStatus(study, apps, people, today = kstToday()) {
  if (study.canceled) return "canceled";
  if (study.closed || pastDeadline(study, today)) return "closed";
  return seatsLeft(study, apps, people) > 0 ? "open" : "full";
}

// 직군 구성: 직군별 인원과 아직 없는 직군 (직군이 섞인 협업 스터디를 돕기 위해)
export function roleMix(study, apps, people) {
  const list = members(study, apps, people);
  const counts = Object.fromEntries(ROLES.map((r) => [r.key, list.filter((p) => p.role === r.key).length]));
  const missing = ROLES.filter((r) => counts[r.key] === 0).map((r) => r.key);
  return { counts, missing };
}

export function myApplication(study, apps, personId) {
  return apps.filter((a) => a.studyId === study.id && a.personId === personId).slice(-1)[0] || null;
}

export function canApply(study, apps, people, personId, today = kstToday()) {
  if (!personId) return { ok: false, reason: "먼저 구글로 로그인해 주세요." };
  if (study.leaderId === personId) return { ok: false, reason: "내가 연 스터디예요." };
  if (study.canceled) return { ok: false, reason: "모집자가 취소한 스터디예요." }; // 함께하던 사람에게도 이 이유가 먼저예요
  const mine = myApplication(study, apps, personId);
  if (mine && mine.status === "removed") return { ok: false, reason: "모집자가 내보낸 스터디라 다시 신청할 수 없어요." };
  if (mine && mine.status === "accepted") return { ok: false, reason: "이미 함께하고 있어요." };
  if (mine && mine.status === "pending") return { ok: false, reason: "신청했어요. 모집자의 답을 기다려 주세요." };
  if (study.closed) return { ok: false, reason: "모집이 마감됐어요." };
  if (pastDeadline(study, today)) return { ok: false, reason: "모집 마감일(" + md(study.deadline) + ")이 지났어요." };
  if (seatsLeft(study, apps, people) === 0) return { ok: false, reason: "정원이 다 찼어요." };
  return { ok: true };
}

// 신청할 때 내가 가능한 시간대(선택)를 함께 남겨요. 모집자가 시간을 정할 때 참고해요.
export function apply(study, apps, people, personId, id, message = "", times = [], today = kstToday()) {
  const c = canApply(study, apps, people, personId, today);
  if (!c.ok) throw new Error(c.reason);
  const te = validateTimes(times, study.days);
  if (te) throw new Error(te);
  return apps.concat({ id, studyId: study.id, personId, status: "pending", message: String(message).trim().slice(0, 80), times: orderTimes(times) });
}

// 겹침 요약(모집자용): 이 스터디 요일에 맞는 시간대마다 가능하다고 한 수락된 사람·대기 중인 사람 수
export function timeSummary(study, apps) {
  const mine = apps.filter((a) => a.studyId === study.id && (a.status === "accepted" || a.status === "pending"));
  return timesForDays(study.days).map((time) => {
    const can = mine.filter((a) => (a.times || []).includes(time));
    return { time, accepted: can.filter((a) => a.status === "accepted").length, pending: can.filter((a) => a.status === "pending").length };
  });
}

// 수락·거절·마감·다시 열기·모집 취소는 모집자만 할 수 있어요. 서버(/api)도 이 함수로 막아요.
export function canManage(study, personId) {
  if (!personId) return { ok: false, reason: "먼저 구글로 로그인해 주세요." };
  if (study.leaderId !== personId) return { ok: false, reason: "모집자만 수락·거절·마감·취소할 수 있어요." };
  return { ok: true };
}
function manage(study, personId) {
  const c = canManage(study, personId);
  if (!c.ok) throw new Error(c.reason);
  if (study.canceled) throw new Error("취소된 스터디예요.");
}

export function closeStudy(study, personId) {
  manage(study, personId);
  if (study.closed) throw new Error("이미 마감한 스터디예요.");
  return { ...study, closed: true };
}

// 마감한 스터디를 다시 열어요. 정원이 찼으면 다시 열어도 신청을 받을 수 없어서 막아요.
// 모집 마감일이 지나서 마감된 스터디는 지난 마감일을 지우고 열어요.
export function reopenStudy(study, apps, people, personId, today = kstToday()) {
  manage(study, personId);
  const past = pastDeadline(study, today);
  if (!study.closed && !past) throw new Error("마감한 스터디만 다시 열 수 있어요.");
  if (seatsLeft(study, apps, people) === 0) throw new Error("정원이 다 차서 다시 열어도 신청을 받을 수 없어요.");
  return past ? { ...study, closed: false, deadline: null } : { ...study, closed: false };
}

// 모집 취소: 되돌릴 수 없어요. 지우지 않고 canceled로 남겨서 목록에서는 빼고, 함께하던 사람에게는 "취소됨"을 보여 줘요.
export function cancelStudy(study, personId, at) {
  const c = canManage(study, personId);
  if (!c.ok) throw new Error(c.reason);
  if (study.canceled) throw new Error("이미 취소한 스터디예요.");
  return { ...study, canceled: true, canceledAt: at };
}

// 신청 취소(거두기): 신청한 사람이 대기 중인 신청만 거둘 수 있어요. 거둔 뒤에는 다시 신청할 수 있어요.
export function withdraw(study, apps, personId, appId) {
  if (!personId) throw new Error("먼저 구글로 로그인해 주세요.");
  const a = apps.find((x) => x.id === appId && x.studyId === study.id);
  if (!a) throw new Error("찾는 신청이 없어요.");
  if (a.personId !== personId) throw new Error("내 신청만 취소할 수 있어요.");
  if (study.canceled) throw new Error("취소된 스터디예요.");
  if (a.status !== "pending") throw new Error("대기 중인 신청만 취소할 수 있어요.");
  return apps.map((x) => (x.id === appId ? { ...x, status: "withdrawn" } : x));
}

// 스스로 나가기: 수락된 본인만 나갈 수 있어요. "left"로 남고 자리가 비어요. 다시 신청하면 모집자가 다시 수락해요.
export function leave(study, apps, personId, appId) {
  if (!personId) throw new Error("먼저 구글로 로그인해 주세요.");
  const a = apps.find((x) => x.id === appId && x.studyId === study.id);
  if (!a) throw new Error("찾는 신청이 없어요.");
  if (a.personId !== personId) throw new Error("본인만 나갈 수 있어요.");
  if (study.canceled) throw new Error("취소된 스터디예요.");
  if (a.status !== "accepted") throw new Error("함께하는 스터디에서만 나갈 수 있어요.");
  return apps.map((x) => (x.id === appId ? { ...x, status: "left" } : x));
}

// 내보내기: 모집자만 수락된 사람을 내보낼 수 있어요. "removed"로 남고 자리가 비어요. 내보낸 사람은 다시 신청할 수 없어요.
export function removeMember(study, apps, personId, appId) {
  manage(study, personId);
  const a = apps.find((x) => x.id === appId && x.studyId === study.id);
  if (!a) throw new Error("찾는 신청이 없어요.");
  if (a.status !== "accepted") throw new Error("함께하는 사람만 내보낼 수 있어요.");
  return apps.map((x) => (x.id === appId ? { ...x, status: "removed" } : x));
}

// 수락하면 정원이 찼는지 다시 봐요. 정원이 차면 남은 대기 신청은 그대로 두고 화면에서 "정원 마감"을 보여 줘요.
export function decide(study, apps, people, appId, status) {
  if (study.canceled) throw new Error("취소된 스터디예요.");
  const a = apps.find((x) => x.id === appId && x.studyId === study.id);
  if (!a || a.status !== "pending") throw new Error("대기 중인 신청만 수락하거나 거절할 수 있어요.");
  if (status === "accepted" && seatsLeft(study, apps, people) === 0) throw new Error("정원이 다 차서 더 수락할 수 없어요.");
  return apps.map((x) => (x.id === appId ? { ...x, status } : x));
}

// 목록 정렬: 모집 중인 스터디가 먼저, 취소한 스터디는 맨 뒤, 같은 묶음 안에서는 최근에 연 순서
export function sortStudies(studies, apps, people, today = kstToday()) {
  const rank = (s) => (s.canceled ? 2 : isOpen(s, apps, people, today) ? 0 : 1);
  return studies.slice().sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
}

// 검색: 스터디 이름·목표·모집자 이름에 검색어의 낱말이 모두 들어 있으면 찾아요 (영문 대소문자는 가리지 않아요)
const fold = (v) => String(v == null ? "" : v).normalize("NFC").toLowerCase();
export function matchesSearch(study, people, q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const leader = people.find((p) => p.id === study.leaderId);
  const text = fold([study.title, study.goal, leader ? leader.name : ""].join(" "));
  return words.every((w) => text.includes(w));
}

// 목록에 보여 줄 스터디: 취소한 스터디는 빼고, 검색어·"모집 중만"·"이 직군이 비어 있는 스터디"를 함께 걸러 정렬해요
export function filterStudies(studies, apps, people, { q = "", openOnly = false, needRole = "", today = kstToday() } = {}) {
  return sortStudies(studies.filter((s) => !s.canceled), apps, people, today).filter((s) =>
    matchesSearch(s, people, q) &&
    (!openOnly || isOpen(s, apps, people, today)) &&
    (!needRole || roleMix(s, apps, people).missing.includes(needRole)));
}

// 알림 문구: 어떤 일이 생겼을 때 누구에게 무엇을 보낼지 정해요. 서버는 이 목록대로 사이트 알림함에 저장하고 푸시로 보내요.
// 일을 한 사람 자신에게는 보내지 않아요. 알림을 누르면 그 스터디 상세(url)로 가요.
export function pushMessages(kind, { study, app = null, apps = [], people = [] }) {
  const name = (id) => ((people.find((p) => p.id === id) || {}).name || "누군가") + "님";
  const t = "‘" + study.title + "’";
  const to = (personId, title, body) => ({ personId, kind, studyId: study.id, title, body, url: "/#/s/" + encodeURIComponent(study.id) });
  switch (kind) {
    case "applied": return [to(study.leaderId, "새 신청이 왔어요", name(app.personId) + "이 " + t + "에 신청했어요.")];
    case "withdrawn": return [to(study.leaderId, "신청이 취소됐어요", name(app.personId) + "이 " + t + " 신청을 취소했어요.")];
    case "left": return [to(study.leaderId, "함께하던 사람이 나갔어요", name(app.personId) + "이 " + t + "에서 나갔어요. 자리가 하나 비었어요.")];
    case "accepted": return [to(app.personId, "신청이 수락됐어요", t + "에 함께하게 됐어요. 결성 다음 할 일을 확인해요.")];
    case "rejected": return [to(app.personId, "신청이 거절됐어요", t + " 신청이 거절됐어요. 다른 스터디도 둘러봐요.")];
    case "removed": return [to(app.personId, "스터디에서 빠졌어요", "모집자가 " + t + "에서 내보냈어요.")];
    case "canceled": {
      const ids = [...new Set(apps.filter((a) => a.studyId === study.id && (a.status === "accepted" || a.status === "pending")).map((a) => a.personId))];
      return ids.map((id) => to(id, "모집이 취소됐어요", "모집자가 " + t + " 모집을 취소했어요."));
    }
    default: return [];
  }
}

// 사이트 알림함: 사람마다 최근 알림 30개를 새것부터 둬요. 푸시와 같은 알림이에요.
export const MAX_NOTES = 30;
export function addNote(list, m, id, at) {
  const note = { id, kind: m.kind, studyId: m.studyId, title: m.title, body: m.body, url: m.url, at, read: false };
  return [note].concat(list || []).slice(0, MAX_NOTES);
}
// 읽음으로 바꾸기: ids 목록이나 "all"
export function markRead(list, ids) {
  return (list || []).map((n) => (ids === "all" || (Array.isArray(ids) && ids.includes(n.id)) ? { ...n, read: true } : n));
}
export const unreadCount = (list) => (list || []).filter((n) => !n.read).length;
// 이 스터디 상세를 열면 읽음으로 바꿀 알림
export const unreadFor = (list, studyId) => (list || []).filter((n) => !n.read && n.studyId === studyId).map((n) => n.id);

// 활기 숫자: 목록 위 숫자 칸에 보여 줘요. 이름은 빼고 숫자만 세요.
//   people 가입한 사람(이름·직군을 저장한 사람) · roles 직군별 인원 · openStudies 모집 중인 스터디
//   members 스터디에 함께하는 사람(모집자+수락된 사람, 한 번씩, 취소한 스터디 빼고) · newThisWeek 최근 7일(오늘 포함) 새로 열린 스터디
export function activityStats(studies, apps, people, today = kstToday()) {
  const live = studies.filter((s) => !s.canceled);
  const joined = new Set();
  live.forEach((s) => members(s, apps, people).forEach((p) => joined.add(p.id)));
  const from = new Date(Date.parse(today) - 6 * 86400000).toISOString().slice(0, 10);
  return {
    people: people.length,
    roles: Object.fromEntries(ROLES.map((r) => [r.key, people.filter((p) => p.role === r.key).length])),
    openStudies: live.filter((s) => isOpen(s, apps, people, today)).length,
    members: joined.size,
    newThisWeek: live.filter((s) => { const d = String(s.createdAt || "").slice(0, 10); return d >= from && d <= today; }).length,
  };
}

// 회원 탈퇴: 내가 연 스터디는 모집 취소, 내 신청은 대기면 신청 취소·수락이면 나감으로 바꾸고,
// 기록 속 내 id는 임시 번호(gone)로 바꾸고 프로필을 빼요. 알림은 지우기 전 이름으로 만들어요.
// 돌려주는 것: { studies, apps, people, messages(보낼 알림), changed: { studies: [id], apps: [id] }(바뀐 기록) }
export function deleteAccount({ studies, apps, people }, personId, gone, at) {
  const messages = [];
  const changed = { studies: [], apps: [] };
  const nextStudies = studies.map((s) => {
    if (s.leaderId !== personId) return s;
    changed.studies.push(s.id);
    if (s.canceled) return { ...s, leaderId: gone };
    const c = { ...s, canceled: true, canceledAt: at };
    messages.push(...pushMessages("canceled", { study: c, apps, people }));
    return { ...c, leaderId: gone };
  });
  const nextApps = apps.map((a) => {
    if (a.personId !== personId) return a;
    changed.apps.push(a.id);
    const s = studies.find((x) => x.id === a.studyId);
    const kind = s && !s.canceled ? (a.status === "pending" ? "withdrawn" : a.status === "accepted" ? "left" : "") : "";
    if (kind) messages.push(...pushMessages(kind, { study: s, app: a, people }));
    return { ...a, status: kind || a.status, personId: gone };
  });
  return { studies: nextStudies, apps: nextApps, people: people.filter((p) => p.id !== personId), messages, changed };
}
// 탈퇴 확인 창에 보여 줄 숫자: 모집 취소될 내 스터디 수, 신청 취소·나감으로 바뀔 내 신청 수
export function accountImpact(state, personId) {
  const out = deleteAccount(state, personId, "-", "");
  return {
    studies: state.studies.filter((s) => s.leaderId === personId && !s.canceled).length,
    apps: out.messages.filter((m) => m.kind === "withdrawn" || m.kind === "left").length,
  };
}
