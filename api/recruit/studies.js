// POST /api/recruit/studies — 스터디 열기 { title, days, times?, mode, capacity, goal, deadline?, startDate?, endDate? }. 연 사람이 모집자예요.
// times(진행 시간대)와 일정(모집 마감일·시작일·종료일, "2026-10-25" 모양)은 안 보내도 돼요.
import { handler } from "../_lib/http.js";
import { createStudy } from "../_lib/recruit.js";

export const methods = {
  POST: async ({ store, user, body }) => ({ status: 201, body: await createStudy(store, await user(), body) }),
};
export default handler(methods);
