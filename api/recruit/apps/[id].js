// PATCH /api/recruit/apps/:id
//   { status: "accepted" | "rejected" } 수락·거절. 그 스터디의 모집자만 할 수 있어요.
//   { status: "withdrawn" }             신청 취소(거두기). 신청한 본인이 대기 중일 때만 할 수 있어요.
import { handler } from "../../_lib/http.js";
import { updateApp } from "../../_lib/recruit.js";

export const methods = {
  PATCH: async ({ store, user, query, body }) => ({ body: await updateApp(store, await user(), String(query.id || ""), body) }),
};
export default handler(methods);
