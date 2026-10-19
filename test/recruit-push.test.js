// npm test: 실제 web-push 라이브러리가 우리 설정으로 만드는 푸시 요청 확인 (브라우저·네트워크 없이)
// web-push의 generateRequestDetails는 보내기 직전의 요청(주소·헤더·암호화한 본문)을 만들어 줘요.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { webPushFromEnv, pushOptions } from "../api/_lib/push.js";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

test("우리 VAPID 키로 서명하고 aes128gcm으로 암호화한 요청을 만들어요", () => {
  const keys = webpush.generateVAPIDKeys();
  const client = createECDH("prime256v1"); // 브라우저가 만들어 주는 구독 키를 흉내 내요
  client.generateKeys();
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: b64url(client.getPublicKey()), auth: b64url(randomBytes(16)) } };
  const d = webpush.generateRequestDetails(sub, JSON.stringify({ title: "새 신청이 왔어요", body: "테스트", url: "/#/s/s-1" }), pushOptions(keys.publicKey, keys.privateKey));
  assert.equal(d.method, "POST");
  assert.equal(d.endpoint, sub.endpoint);
  assert.equal(d.headers["Content-Encoding"], "aes128gcm");
  assert.equal(d.headers.TTL, 86400);
  assert.ok(d.body.length > 0);
  assert.ok(!d.body.toString().includes("새 신청")); // 본문은 암호화돼서 푸시 서버가 읽을 수 없어요
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(d.headers.Authorization);
  assert.ok(m, d.headers.Authorization);
  assert.equal(m[2], keys.publicKey);
  const claims = JSON.parse(Buffer.from(m[1].split(".")[1], "base64url").toString());
  assert.equal(claims.sub, "https://study-matching-nu.vercel.app");
  assert.equal(claims.aud, "https://fcm.googleapis.com");
});

test("알림 키가 둘 다 있어야 푸시를 켜요", () => {
  assert.equal(webPushFromEnv({}), null);
  assert.equal(webPushFromEnv({ VAPID_PUBLIC_KEY: "x" }), null);
  const keys = webpush.generateVAPIDKeys();
  const push = webPushFromEnv({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey });
  assert.equal(push.publicKey, keys.publicKey);
  assert.equal(typeof push.send, "function");
});
