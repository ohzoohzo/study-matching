// GET /api/recruit/state — 스터디·신청·사람(보여 줄 이름·직군) 전체. 로그인하지 않아도 볼 수 있어요.
import { handler } from "../_lib/http.js";
import { getState } from "../_lib/recruit.js";

export const methods = {
  GET: async ({ store }) => ({ body: await getState(store) }),
};
export default handler(methods);
