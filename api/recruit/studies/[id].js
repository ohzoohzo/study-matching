// PATCH /api/recruit/studies/:id — { closed: true } 모집 마감. 모집자만 할 수 있어요.
import { handler } from "../../_lib/http.js";
import { closeStudy } from "../../_lib/recruit.js";

export const methods = {
  PATCH: async ({ store, user, query, body }) => ({ body: await closeStudy(store, await user(), String(query.id || ""), body) }),
};
export default handler(methods);
