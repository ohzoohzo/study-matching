// POST /api/recruit/apps — 스터디 신청 { studyId, message }. 신청한 사람은 로그인한 나예요.
import { handler } from "../_lib/http.js";
import { applyStudy } from "../_lib/recruit.js";

export const methods = {
  POST: async ({ store, user, body }) => ({ status: 201, body: await applyStudy(store, await user(), body) }),
};
export default handler(methods);
