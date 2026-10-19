// /api/recruit/me — 로그인한 내 프로필 (Authorization: Bearer <구글 ID 토큰>)
//   GET  내 프로필(처음이면 null)과 구글이 확인해 준 계정 정보
//   PUT  { name, role } 보여 줄 이름·직군 저장 (처음 저장·고치기 모두)
import { handler } from "../_lib/http.js";
import { getMe, saveMe } from "../_lib/recruit.js";

export const methods = {
  GET: async ({ store, user }) => ({ body: await getMe(store, await user()) }),
  PUT: async ({ store, user, body }) => ({ body: await saveMe(store, await user(), body) }),
};
export default handler(methods);
