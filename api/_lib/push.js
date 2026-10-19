// 브라우저 푸시 알림: 구독 저장·지우기와 보내기. 알림을 못 보내도 신청·수락 같은 본 동작은 실패하지 않아요.
// VAPID 키는 환경변수에 둬요: VAPID_PUBLIC_KEY(공개, 화면이 받아 가요), VAPID_PRIVATE_KEY(비밀, 서버에만).
import webpush from "web-push";
import { HttpError } from "./errors.js";

const SITE = "https://study-matching-nu.vercel.app"; // 푸시 서버가 보낸 곳을 알 수 있게 VAPID subject로 써요
// 브라우저 회사의 푸시 서버로만 보내요. 아무 주소나 등록해서 우리 서버가 그 주소로 요청을 보내게 하는 걸 막아요.
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const MAX_DEVICES = 5;

// 보낼 때 쓰는 설정: 하루 동안 기기가 꺼져 있어도 기다려 주고(TTL), 4초 안에 답이 없으면 넘어가요
export const pushOptions = (publicKey, privateKey) => ({ TTL: 86400, timeout: 4000, vapidDetails: { subject: SITE, publicKey, privateKey } });

export function webPushFromEnv(env = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY, privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, send: (sub, payload) => webpush.sendNotification(sub, payload, pushOptions(publicKey, privateKey)) };
}

// 브라우저가 준 구독 정보에서 주소와 키 두 개만 꺼내요. 모양이 틀리거나 푸시 서버 주소가 아니면 400이에요.
export function cleanSubscription(sub) {
  const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
  if (!sub || !str(sub.endpoint, 1000) || !sub.keys || !str(sub.keys.p256dh, 200) || !str(sub.keys.auth, 100)) {
    throw new HttpError(400, "알림 구독 정보를 읽지 못했어요. 알림을 다시 켜 주세요.");
  }
  let url = null;
  try { url = new URL(sub.endpoint); } catch (e) { /* 아래에서 막아요 */ }
  const host = url ? url.hostname : "";
  if (!url || url.protocol !== "https:" || !PUSH_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
    throw new HttpError(400, "브라우저 푸시 서버 주소가 아니에요.");
  }
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}

export function needPush(push) {
  if (!push) throw new HttpError(503, "알림은 아직 준비 중이에요.");
}

// 이 기기 구독 저장: 같은 기기는 한 번만, 기기는 5대까지(오래된 것부터 빼요)
export function subscribe(store, user, body) {
  const sub = cleanSubscription(body && body.subscription);
  return store.withLock("subs:" + user.id, async () => {
    const next = (await store.getSubs(user.id)).filter((s) => s.endpoint !== sub.endpoint).concat(sub).slice(-MAX_DEVICES);
    await store.setSubs(user.id, next);
    return { devices: next.length };
  });
}

export function unsubscribe(store, user, body) {
  const endpoint = body && typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) throw new HttpError(400, "끌 알림 구독을 찾지 못했어요.");
  return store.withLock("subs:" + user.id, async () => {
    const next = (await store.getSubs(user.id)).filter((s) => s.endpoint !== endpoint);
    await store.setSubs(user.id, next);
    return { devices: next.length };
  });
}

// 알림 보내기: 받는 사람의 기기마다 보내요. 사라진 구독(404·410)은 지우고, 다른 실패는 기록만 하고 넘어가요.
// 기기마다 결과({ personId, host, tail, ok, status, error })를 돌려주고 로그에도 남겨요(원인을 찾을 때 봐요). 주소 전체는 남기지 않아요.
// 스터디 잠금이 풀린 뒤에 불러요(잠금 안에서 부르면 기다림이 길어져요).
export async function sendPush(store, push, messages) {
  if (!push || !messages || !messages.length) return { sent: 0, results: [] };
  const results = [];
  await Promise.all(messages.map(async (m) => {
    try {
      const subs = await store.getSubs(m.personId);
      if (!subs.length) return;
      const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag, test: m.test });
      const gone = [];
      const done = await Promise.all(subs.map(async (s) => {
        const host = new URL(s.endpoint).hostname, tail = s.endpoint.slice(-8);
        try {
          const res = await push.send(s, payload);
          const status = (res && res.statusCode) || null;
          console.log("push sent", status, host);
          return { personId: m.personId, host, tail, ok: true, status, error: "" };
        } catch (e) {
          const status = (e && e.statusCode) || null;
          if (status === 404 || status === 410) gone.push(s.endpoint);
          console.error("push failed", status, host, e && (e.body || e.message));
          return { personId: m.personId, host, tail, ok: false, status, error: String((e && (e.body || e.message)) || "").slice(0, 200) };
        }
      }));
      results.push(...done);
      if (gone.length) {
        await store.withLock("subs:" + m.personId, async () =>
          store.setSubs(m.personId, (await store.getSubs(m.personId)).filter((s) => !gone.includes(s.endpoint))));
      }
    } catch (e) { console.error("push failed", e && e.message); }
  }));
  return { sent: results.filter((r) => r.ok).length, results };
}

// 테스트 알림: 로그인한 내 기기들로 지금 보내고 기기마다 결과를 돌려줘요. 알림함에는 쌓지 않아요.
// 진짜 알림과 같은 보내기 경로(sendPush)를 써서, 어디서 끊기는지(서버→푸시 서버→기기) 가를 수 있어요.
export async function testPush(store, push, user) {
  needPush(push);
  const msg = { personId: user.id, title: "테스트 알림", body: "이 기기로 알림이 잘 와요. 누르면 사이트가 열려요.", url: "/#/", tag: "test-" + Date.now(), test: true };
  const { results } = await sendPush(store, push, [msg]);
  return { results: results.map(({ host, tail, ok, status, error }) => ({ host, tail, ok, status, error })) };
}
