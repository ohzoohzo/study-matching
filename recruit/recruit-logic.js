// 공지용 스터디 모집 규칙. 화면(recruit.js)·서버 함수(api/_lib/recruit.js)·테스트가 같이 써요.
// 구성원이 구글로 로그인해 스터디를 열고(이름·요일·목표) → 다른 사람이 신청하고 → 모집자가 수락하면 함께해요.
// 주제는 따로 고르지 않고 스터디 이름에 적어요.
// 모집자는 마감·다시 열기·모집 취소를, 신청자는 대기 중인 신청 거두기를 할 수 있어요.
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

// 스터디 등록 입력 검사: 틀린 칸마다 이유를 돌려줘요
export function validateStudy(s) {
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
export function isOpen(study, apps, people) {
  return !study.canceled && !study.closed && seatsLeft(study, apps, people) > 0;
}
// 카드·목록에 보여 줄 상태: open 모집 중 · full 정원 마감 · closed 마감 · canceled 취소됨
export function studyStatus(study, apps, people) {
  if (study.canceled) return "canceled";
  if (study.closed) return "closed";
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

export function canApply(study, apps, people, personId) {
  if (!personId) return { ok: false, reason: "먼저 구글로 로그인해 주세요." };
  if (study.leaderId === personId) return { ok: false, reason: "내가 연 스터디예요." };
  if (study.canceled) return { ok: false, reason: "모집자가 취소한 스터디예요." }; // 함께하던 사람에게도 이 이유가 먼저예요
  const mine = myApplication(study, apps, personId);
  if (mine && mine.status === "accepted") return { ok: false, reason: "이미 함께하고 있어요." };
  if (mine && mine.status === "pending") return { ok: false, reason: "신청했어요. 모집자의 답을 기다려 주세요." };
  if (study.closed) return { ok: false, reason: "모집이 마감됐어요." };
  if (seatsLeft(study, apps, people) === 0) return { ok: false, reason: "정원이 다 찼어요." };
  return { ok: true };
}

// 신청할 때 내가 가능한 시간대(선택)를 함께 남겨요. 모집자가 시간을 정할 때 참고해요.
export function apply(study, apps, people, personId, id, message = "", times = []) {
  const c = canApply(study, apps, people, personId);
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
export function reopenStudy(study, apps, people, personId) {
  manage(study, personId);
  if (!study.closed) throw new Error("마감한 스터디만 다시 열 수 있어요.");
  if (seatsLeft(study, apps, people) === 0) throw new Error("정원이 다 차서 다시 열어도 신청을 받을 수 없어요.");
  return { ...study, closed: false };
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

// 수락하면 정원이 찼는지 다시 봐요. 정원이 차면 남은 대기 신청은 그대로 두고 화면에서 "정원 마감"을 보여 줘요.
export function decide(study, apps, people, appId, status) {
  if (study.canceled) throw new Error("취소된 스터디예요.");
  const a = apps.find((x) => x.id === appId && x.studyId === study.id);
  if (!a || a.status !== "pending") throw new Error("대기 중인 신청만 수락하거나 거절할 수 있어요.");
  if (status === "accepted" && seatsLeft(study, apps, people) === 0) throw new Error("정원이 다 차서 더 수락할 수 없어요.");
  return apps.map((x) => (x.id === appId ? { ...x, status } : x));
}

// 목록 정렬: 모집 중인 스터디가 먼저, 취소한 스터디는 맨 뒤, 같은 묶음 안에서는 최근에 연 순서
export function sortStudies(studies, apps, people) {
  const rank = (s) => (s.canceled ? 2 : isOpen(s, apps, people) ? 0 : 1);
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
export function filterStudies(studies, apps, people, { q = "", openOnly = false, needRole = "" } = {}) {
  return sortStudies(studies.filter((s) => !s.canceled), apps, people).filter((s) =>
    matchesSearch(s, people, q) &&
    (!openOnly || isOpen(s, apps, people)) &&
    (!needRole || roleMix(s, apps, people).missing.includes(needRole)));
}
