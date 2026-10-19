// POST /api/recruit/apps — 스터디 신청 { studyId, message, times? }. 신청한 사람은 로그인한 나예요. times(가능한 시간대)는 안 보내도 돼요.
import { handler } from "../_lib/http.js";
import { applyStudy } from "../_lib/recruit.js";

export const methods = {
  POST: async ({ store, user, body, notify }) => ({ status: 201, body: await applyStudy(store, await user(), body, notify) }),
};
export default handler(methods);
