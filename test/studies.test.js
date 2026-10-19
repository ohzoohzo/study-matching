// npm test로 API 규칙을 확인해요. (Vercel 없이 함수만 불러서 시험해요)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { validateStudy } from "../api/studies.js";

function call(method, { query = {}, body } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(text) { resolve({ status: this.statusCode, headers: this.headers, json: JSON.parse(text) }); },
    };
    handler({ method, query, body }, res);
  });
}

test("목록은 최신 순이에요", async () => {
  const { status, json } = await call("GET");
  assert.equal(status, 200);
  const dates = json.studies.map((s) => s.createdAt);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal(json.count, json.studies.length);
});

test("분야·방식·모집중으로 거를 수 있어요", async () => {
  const { json } = await call("GET", { query: { category: "개발", mode: "온라인", open: "1" } });
  assert.ok(json.studies.length > 0);
  assert.ok(json.studies.every((s) => s.category === "개발" && s.mode === "온라인" && s.status === "모집중"));
});

test("없는 스터디는 404와 이유를 돌려줘요", async () => {
  const { status, json } = await call("GET", { query: { id: "없는-id" } });
  assert.equal(status, 404);
  assert.match(json.error, /없어요/);
});

test("모집글 입력이 틀리면 400과 칸별 이유를 돌려줘요", async () => {
  const { status, json } = await call("POST", { body: { title: "a", category: "요리", mode: "오프라인", capacity: 1 } });
  assert.equal(status, 400);
  assert.deepEqual(Object.keys(json.fields).sort(), ["capacity", "category", "region", "title"]);
});

test("입력이 맞아도 저장은 아직 준비 중(501)이에요", async () => {
  const { status } = await call("POST", { body: { title: "새 스터디", category: "개발", mode: "온라인", capacity: 4 } });
  assert.equal(status, 501);
});

test("정원은 2~20명이에요", () => {
  assert.ok(validateStudy({ title: "제목", category: "개발", mode: "온라인", capacity: 21 }).capacity);
  assert.equal(validateStudy({ title: "제목", category: "개발", mode: "온라인", capacity: 20 }).capacity, undefined);
});

test("GET·POST 말고는 405예요", async () => {
  const { status, headers } = await call("DELETE");
  assert.equal(status, 405);
  assert.equal(headers.allow, "GET, POST");
});
