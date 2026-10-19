// PATCH /api/recruit/studies/:id — 모집자만 할 수 있어요.
//   { closed: true }   모집 마감
//   { closed: false }  마감한 스터디 다시 열기
//   { canceled: true } 모집 취소 (지우지 않고 "취소됨"으로 남겨요. 되돌릴 수 없어요)
import { handler } from "../../_lib/http.js";
import { updateStudy } from "../../_lib/recruit.js";

export const methods = {
  PATCH: async ({ store, user, query, body }) => ({ body: await updateStudy(store, await user(), String(query.id || ""), body) }),
};
export default handler(methods);
