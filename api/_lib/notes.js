// 사이트 알림함: 일이 생기면 받을 사람의 알림함에 저장하고, 알림을 켠 기기에는 푸시도 보내요(같은 알림).
// 푸시 키가 없거나 알림을 안 켰어도 알림함에는 쌓여요. 알림함은 공개 목록(state)에 나오지 않아요.
import { randomUUID } from "node:crypto";
import * as R from "../../recruit/recruit-logic.js";
import { HttpError } from "./errors.js";
import { sendPush } from "./push.js";
import { kstMinute } from "./recruit.js";

// 알림 보내기: 알림함에 저장 → 푸시. 실패해도 던지지 않아요(신청·수락 같은 본 동작은 이미 끝났어요).
export async function deliver(store, push, messages) {
  if (!messages || !messages.length) return;
  const at = kstMinute();
  for (const m of messages) {
    try {
      await store.withLock("notes:" + m.personId, async () =>
        store.setNotes(m.personId, R.addNote(await store.getNotes(m.personId), m, "n-" + randomUUID().slice(0, 12), at)));
    } catch (e) { console.error("note failed", e && e.message); }
  }
  await sendPush(store, push, messages);
}

const view = (list) => ({ notes: list, unread: R.unreadCount(list) });

export async function listNotes(store, user) {
  return view(await store.getNotes(user.id));
}

// 읽음으로 바꾸기: { ids: ["n-…"] } 고른 알림 · { all: true } 모두. 내 알림함만 바뀌어요.
export function readNotes(store, user, body) {
  const all = body && body.all === true;
  const ids = body && Array.isArray(body.ids) && body.ids.length <= 100 && body.ids.every((x) => typeof x === "string") ? body.ids : null;
  if (!all && !ids) throw new HttpError(400, "읽음으로 바꿀 알림을 골라 주세요.");
  return store.withLock("notes:" + user.id, async () => {
    const list = R.markRead(await store.getNotes(user.id), all ? "all" : ids);
    await store.setNotes(user.id, list);
    return view(list);
  });
}
