// POST /api/recruit/studies — 스터디 열기 { topic, title, days, mode, capacity, goal }. 연 사람이 모집자예요.
import { handler } from "../_lib/http.js";
import { createStudy } from "../_lib/recruit.js";

export const methods = {
  POST: async ({ store, user, body }) => ({ status: 201, body: await createStudy(store, await user(), body) }),
};
export default handler(methods);
