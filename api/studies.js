// /api/studies — 스터디 모집글 API 예시 (Vercel 서버 함수)
//
//   GET  /api/studies                         모집글 목록 (최신 순)
//   GET  /api/studies?category=개발&mode=온라인&open=1   분야·방식·모집중만 거르기
//   GET  /api/studies?id=s1                   모집글 하나
//   POST /api/studies                         모집글 만들기 (입력 검사만 하고, 저장은 아직 501)
//
// 응답은 항상 JSON이고, 실패하면 { error: "사람이 읽을 수 있는 문장" }을 돌려줘요.
import { listStudies, getStudy, createStudy, CATEGORIES, MODES } from "./_lib/store.js";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// 모집글 입력 검사: 틀린 칸마다 이유를 모아 돌려줘요
export function validateStudy(input = {}) {
  const errors = {};
  const title = String(input.title || "").trim();
  if (title.length < 2 || title.length > 40) errors.title = "제목은 2~40자로 적어 주세요.";
  if (!CATEGORIES.includes(input.category)) errors.category = `분야는 ${CATEGORIES.join(", ")} 중에서 골라 주세요.`;
  if (!MODES.includes(input.mode)) errors.mode = "온라인 또는 오프라인을 골라 주세요.";
  if (input.mode === "오프라인" && !String(input.region || "").trim()) errors.region = "오프라인 스터디는 지역을 적어 주세요.";
  const cap = Number(input.capacity);
  if (!Number.isInteger(cap) || cap < 2 || cap > 20) errors.capacity = "정원은 2~20명 사이로 적어 주세요.";
  return errors;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.id) {
        const study = getStudy(String(q.id));
        return study ? send(res, 200, { study }) : send(res, 404, { error: "찾는 스터디가 없어요." });
      }
      const studies = listStudies({ category: q.category, mode: q.mode, openOnly: q.open === "1" });
      return send(res, 200, { studies, count: studies.length });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const errors = validateStudy(body);
      if (Object.keys(errors).length) return send(res, 400, { error: "입력한 내용을 확인해 주세요.", fields: errors });
      const study = createStudy(body);
      return send(res, 201, { study });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "이 주소는 GET과 POST만 받아요." });
  } catch (err) {
    return send(res, err.status || 500, { error: err.status ? err.message : "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요." });
  }
}
