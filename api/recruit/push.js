// /api/recruit/push — 브라우저 푸시 알림
//   GET     { publicKey, enabled } 알림 공개키. 누구나 받아요 (알림 키가 없으면 enabled: false)
//   POST    { subscription } 이 기기 구독 저장. 로그인한 나만 (브라우저 회사의 푸시 서버 주소만 받아요)
//   POST    { test: true } 테스트 알림: 내 기기들로 지금 보내고 기기마다 푸시 서버 응답을 돌려줘요. 로그인한 나만
//   DELETE  { endpoint } 이 기기 구독 지우기. 로그인한 나만
import { handler } from "../_lib/http.js";
import { needPush, subscribe, unsubscribe, testPush } from "../_lib/push.js";

export const methods = {
  GET: async ({ push }) => ({ body: { publicKey: push ? push.publicKey : null, enabled: !!push } }),
  POST: async ({ store, user, push, body }) => {
    const me = await user();
    if (body && body.test === true) return { body: await testPush(store, push, me) };
    needPush(push);
    return { body: await subscribe(store, me, body) };
  },
  DELETE: async ({ store, user, body }) => ({ body: await unsubscribe(store, await user(), body) }),
};
export default handler(methods);
