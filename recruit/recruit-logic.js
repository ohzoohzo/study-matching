// 공지용 스터디 모집 규칙. 화면(recruit.js)과 테스트가 같이 써요.
// 구성원이 스터디를 열고(주제·횟수·요일·목표) → 다른 사람이 신청하고 → 모집자가 수락하면 함께해요.

export const ROLES = [
  { key: "dev", label: "개발" },
  { key: "design", label: "디자인" },
  { key: "po", label: "PO" },
  { key: "marketing", label: "마케터" },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

// 영희 강사님 추천 10월 파이썬 스터디 권장 주제
export const TOPICS = [
  { key: "t1", label: "주제1 · 파이썬 기본 문법과 자료구조" },
  { key: "t2", label: "주제2 · 함수와 모듈, 개발 환경" },
  { key: "t3", label: "주제3 · NumPy 기초" },
  { key: "t4", label: "주제4 · pandas로 데이터 다루기" },
  { key: "t5", label: "주제5 · 외부 API 호출" },
  { key: "t6", label: "주제6 · Streamlit으로 화면 만들기" },
  { key: "t7", label: "주제7 · Flask로 웹 서버 만들기" },
  { key: "free", label: "직접 정하기" },
];
export const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.key, t.label]));
export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
export const MODES = ["ZEP 온라인", "오프라인"];
export const MAX_CAPACITY = 6; // 공지: 6명 이내 권장

// 스터디 등록 입력 검사: 틀린 칸마다 이유를 돌려줘요
export function validateStudy(s) {
  const e = {};
  if (!TOPIC_LABEL[s.topic]) e.topic = "학습 주제를 하나 골라 주세요.";
  const title = String(s.title || "").trim();
  if (title.length < 2 || title.length > 40) e.title = "스터디 이름을 2~40자로 적어 주세요.";
  const per = Number(s.perWeek);
  if (!Number.isInteger(per) || per < 1 || per > 7) e.perWeek = "횟수를 골라 주세요.";
  const days = s.days || [];
  if (!days.length) e.days = "진행 요일을 하나 이상 골라 주세요.";
  else if (days.some((d) => !DAYS.includes(d))) e.days = "요일은 목록에서 골라 주세요.";
  else if (Number.isInteger(per) && days.length !== per) e.days = "고른 요일 수(" + days.length + "개)가 주 " + per + "회와 맞지 않아요.";
  const goal = String(s.goal || "").trim();
  if (goal.length < 5 || goal.length > 80) e.goal = "간단 목표를 5~80자로 적어 주세요.";
  if (!MODES.includes(s.mode)) e.mode = "진행 방식을 골라 주세요.";
  const cap = Number(s.capacity);
  if (!Number.isInteger(cap) || cap < 2 || cap > MAX_CAPACITY) e.capacity = "정원은 2~" + MAX_CAPACITY + "명 사이로 골라 주세요.";
  return e;
}

export function validateProfile(p) {
  const e = {};
  const name = String(p.name || "").trim();
  if (name.length < 2 || name.length > 12) e.name = "닉네임을 2~12자로 적어 주세요.";
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
  return !study.closed && seatsLeft(study, apps, people) > 0;
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
  if (!personId) return { ok: false, reason: "먼저 닉네임과 직군을 알려 주세요." };
  if (study.leaderId === personId) return { ok: false, reason: "내가 연 스터디예요." };
  const mine = myApplication(study, apps, personId);
  if (mine && mine.status === "accepted") return { ok: false, reason: "이미 함께하고 있어요." };
  if (mine && mine.status === "pending") return { ok: false, reason: "신청했어요. 모집자의 답을 기다려 주세요." };
  if (study.closed) return { ok: false, reason: "모집이 마감됐어요." };
  if (seatsLeft(study, apps, people) === 0) return { ok: false, reason: "정원이 다 찼어요." };
  return { ok: true };
}

export function apply(study, apps, people, personId, id, message = "") {
  const c = canApply(study, apps, people, personId);
  if (!c.ok) throw new Error(c.reason);
  return apps.concat({ id, studyId: study.id, personId, status: "pending", message: String(message).trim().slice(0, 80) });
}

// 수락하면 정원이 찼는지 다시 봐요. 정원이 차면 남은 대기 신청은 그대로 두고 화면에서 "정원 마감"을 보여 줘요.
export function decide(study, apps, people, appId, status) {
  const a = apps.find((x) => x.id === appId && x.studyId === study.id);
  if (!a || a.status !== "pending") throw new Error("대기 중인 신청만 수락하거나 거절할 수 있어요.");
  if (status === "accepted" && seatsLeft(study, apps, people) === 0) throw new Error("정원이 다 차서 더 수락할 수 없어요.");
  return apps.map((x) => (x.id === appId ? { ...x, status } : x));
}

// 목록 정렬: 모집 중인 스터디가 먼저, 그다음 최근에 연 순서
export function sortStudies(studies, apps, people) {
  return studies.slice().sort((a, b) => Number(isOpen(b, apps, people)) - Number(isOpen(a, apps, people)) || b.createdAt.localeCompare(a.createdAt));
}
