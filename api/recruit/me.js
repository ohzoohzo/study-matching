// /api/recruit/me — 로그인한 내 프로필 (Authorization: Bearer <구글 ID 토큰>)
//   GET  내 프로필(처음이면 null)과 구글이 확인해 준 계정 정보
//   PUT  { name, role } 보여 줄 이름·직군 저장 (처음 저장·고치기 모두)
//   DELETE 회원 탈퇴: 내 스터디는 모집 취소, 내 신청은 신청 취소·나감, 기록 속 내 id는 임시 번호로, 프로필·푸시 구독·알림함은 삭제
import { handler } from "../_lib/http.js";
import { getMe, saveMe, deleteMe } from "../_lib/recruit.js";

export const methods = {
  GET: async ({ store, user }) => ({ body: await getMe(store, await user()) }),
  PUT: async ({ store, user, body }) => ({ body: await saveMe(store, await user(), body) }),
  DELETE: async ({ store, user, notify }) => ({ body: await deleteMe(store, await user(), notify) }),
};
export default handler(methods);
