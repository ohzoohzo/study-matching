// /api/recruit/notes — 사이트 알림함 (로그인한 나만)
//   GET    { notes, unread } 내 최근 알림 30개(새것부터)와 안 읽은 개수
//   PATCH  { ids: ["n-…"] } 고른 알림을 읽음으로 · { all: true } 모두 읽음으로
import { handler } from "../_lib/http.js";
import { listNotes, readNotes } from "../_lib/notes.js";

export const methods = {
  GET: async ({ store, user }) => ({ body: await listNotes(store, await user()) }),
  PATCH: async ({ store, user, body }) => ({ body: await readNotes(store, await user(), body) }),
};
export default handler(methods);
