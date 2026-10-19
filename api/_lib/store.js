// 데이터 읽고 쓰기는 이 파일 한 곳에서만 해요.
// 지금은 data/seed.json을 읽기만 해요. Vercel 서버는 파일에 쓸 수 없어서,
// 저장 기능은 나중에 Vercel Storage(Redis 또는 Postgres)를 붙이고 이 파일만 바꾸면 돼요.
// (api/ 안에서 _로 시작하는 폴더는 Vercel이 API 주소로 만들지 않아요.)
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cache = null;

function load() {
  if (!cache) {
    const raw = readFileSync(join(process.cwd(), "data", "seed.json"), "utf8");
    cache = JSON.parse(raw).studies;
  }
  return cache;
}

export const CATEGORIES = ["개발", "디자인", "어학", "자격증", "취업", "독서"];
export const MODES = ["온라인", "오프라인"];

// 목록: 분야·방식·모집중만 걸러서 최신 순으로 돌려줘요
export function listStudies({ category, mode, openOnly } = {}) {
  return load()
    .filter((s) => !category || s.category === category)
    .filter((s) => !mode || s.mode === mode)
    .filter((s) => !openOnly || s.status === "모집중")
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getStudy(id) {
  return load().find((s) => s.id === id) || null;
}

// 저장은 아직 준비 중이에요. 저장소를 붙이면 여기서 저장하고 만든 스터디를 돌려줘요.
export function createStudy() {
  const err = new Error("저장 기능은 아직 준비 중이에요. Vercel Storage를 연결하면 열려요.");
  err.status = 501;
  throw err;
}
