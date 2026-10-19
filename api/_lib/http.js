// 서버 함수 공통: 요청 방법 나누기, 로그인 확인, JSON 응답, 오류 모양.
// 응답은 항상 JSON이고, 실패하면 { error: "사람이 읽을 수 있는 문장", fields?: { 칸: 이유 } }을 돌려줘요.
import { HttpError } from "./errors.js";
import { redisStore } from "./store.js";
import { verifyGoogleToken } from "./auth.js";

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  const b = req.body;
  if (b == null || b === "") return {};
  if (typeof b === "string" || Buffer.isBuffer(b)) {
    try { return JSON.parse(String(b)) || {}; } catch (e) { throw new HttpError(400, "요청 내용을 읽지 못했어요."); }
  }
  return typeof b === "object" ? b : {};
}

// Authorization: Bearer <구글 ID 토큰> → { id: "me-g"+sub, sub, name, email, exp }
async function readUser(req, verify) {
  const m = /^Bearer\s+(\S+)$/.exec((req.headers && req.headers.authorization) || "");
  if (!m) throw new HttpError(401, "먼저 구글로 로그인해 주세요.");
  let account;
  try { account = await verify(m[1]); } catch (e) { throw new HttpError(401, "로그인 시간이 지났어요. 다시 구글로 로그인해 주세요."); }
  return { id: "me-g" + account.sub, ...account };
}

let store = null;
const defaults = {
  get store() { return (store = store || redisStore()); },
  verify: verifyGoogleToken,
};

// methods: { GET: (ctx) => ({ status?, body }) } — ctx: { store, query, body, user() }
export function handler(methods, deps = defaults) {
  const allow = Object.keys(methods).join(", ");
  return async function (req, res) {
    const fn = methods[req.method];
    if (!fn) {
      res.setHeader("Allow", allow);
      return send(res, 405, { error: "이 주소는 " + allow + " 요청만 받아요." });
    }
    try {
      const ctx = { store: deps.store, query: req.query || {}, body: req.method === "GET" ? {} : readBody(req), user: () => readUser(req, deps.verify) };
      const out = await fn(ctx);
      return send(res, out.status || 200, out.body);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, err.fields ? { error: err.message, fields: err.fields } : { error: err.message });
      console.error(err);
      return send(res, 500, { error: "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요." });
    }
  };
}
