import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as R from "../recruit/recruit-logic.js";

// 실제 알림함과 service worker 수신 코드를 실행해, 푸시 수신부터 서버 재조회·배지 반영까지 확인해요.
// DOM과 API 경계만 바꾸며 알림 계산·읽음 처리·이벤트 핸들러는 제품 코드를 그대로 써요.
const source = readFileSync(new URL("../recruit/recruit.js", import.meta.url), "utf8");
const start = source.indexOf("let notes = null;");
const end = source.indexOf("async function checkPush()", start);
assert.ok(start >= 0 && end > start, "알림함과 푸시 수신 코드가 있어야 해요");
const notificationSource = source.slice(start, end);
const visibilityStart = source.indexOf('document.addEventListener("visibilitychange"');
const visibilityEnd = source.indexOf("\n\nmeBtn.addEventListener", visibilityStart);
assert.ok(visibilityStart >= 0 && visibilityEnd > visibilityStart, "탭 복귀 핸들러가 있어야 해요");
const visibilitySource = source.slice(visibilityStart, visibilityEnd);

function element(hidden = false) {
  return {
    hidden, textContent: "", innerHTML: "", attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

function setup({ initialNotes = [], hash = "#/", signedIn = true, syncResult = false } = {}) {
  let serverNotes = structuredClone(initialNotes);
  let onMessage;
  let onVisibility;
  let syncCalls = 0;
  const calls = [];
  const noteBtn = element();
  const notePanel = element(false);
  const badge = element(true);
  const context = vm.createContext({
    R, noteBtn, notePanel,
    navigator: {
      userAgent: "Macintosh",
      serviceWorker: {
        addEventListener(type, listener) {
          assert.equal(type, "message");
          onMessage = listener;
        },
      },
    },
    window: {},
    document: {
      visibilityState: "visible",
      addEventListener(type, listener) {
        assert.equal(type, "visibilitychange");
        onVisibility = listener;
      },
      getElementById(id) {
        if (id === "noteBadge") return badge;
        throw new Error("예상하지 않은 요소: " + id);
      },
    },
    location: { hash },
    syncState: async () => {
      syncCalls++;
      // 상태를 실제로 동기화한 경로는 자기 알림 조회까지 맡고 있어요.
      if (syncResult) await context.notifications.load();
      return syncResult;
    },
    me: () => signedIn ? { id: "me-1" } : null,
    esc: (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    ICON: { warn: "" },
    api: async (method, path, body) => {
      assert.equal(path, "notes");
      calls.push({ method, path, body });
      if (method === "PATCH") serverNotes = R.markRead(serverNotes, body.all ? "all" : body.ids);
      else assert.equal(method, "GET");
      return { notes: structuredClone(serverNotes) };
    },
  });
  vm.runInContext(notificationSource + visibilitySource + `
    globalThis.notifications = {
      load: loadNotes,
      readOpenStudy
    };
  `, context, { filename: "recruit/recruit.js (notifications)" });
  assert.equal(typeof onMessage, "function");
  assert.equal(typeof onVisibility, "function");
  return {
    calls, noteBtn, notePanel, badge,
    load: () => context.notifications.load(),
    setHash(value) { context.location.hash = value; },
    async readOpenStudy() {
      context.notifications.readOpenStudy();
      await new Promise(setImmediate);
    },
    replaceServerNotes(value) { serverNotes = structuredClone(value); },
    getServerNotes: () => structuredClone(serverNotes),
    getSyncCalls: () => syncCalls,
    async visibility(state) {
      context.document.visibilityState = state;
      onVisibility();
      await new Promise(setImmediate);
    },
    async receive(data) {
      onMessage({ data });
      // 이벤트 핸들러가 시작한 API와 읽음 처리의 microtask가 끝나는 다음 이벤트 루프까지 기다려요.
      await new Promise(setImmediate);
    },
  };
}

const note = (id, extra = {}) => ({
  id, title: "알림 " + id, body: "새 소식", studyId: "study-other", url: "/#/s/study-other",
  at: "2026-10-22T09:00:00.000Z", read: false, ...extra,
});

test("일반 푸시가 도착하면 서버 알림함을 다시 조회해 열린 목록과 안 읽은 개수를 갱신해요", async () => {
  const ui = setup({ initialNotes: [note("old")] });
  await ui.load();
  assert.equal(ui.badge.textContent, "1");

  ui.replaceServerNotes([note("old"), note("new-1"), note("new-2"), note("read", { read: true })]);
  await ui.receive({ type: "push-received", test: false });

  assert.equal(ui.calls.length, 2, "푸시 수신 직후 새 GET 요청을 보내야 해요");
  assert.equal(ui.badge.textContent, "3");
  assert.equal(ui.badge.hidden, false);
  assert.equal(ui.noteBtn.attributes["aria-label"], "알림, 안 읽은 알림 3개");
  assert.match(ui.notePanel.innerHTML, /알림 new-2/);

  await ui.receive({ type: "push-received" });
  assert.equal(ui.badge.textContent, "3", "같은 이벤트를 다시 받아도 서버 개수를 유지해요");
});

test("푸시 수신 이외의 service worker 메시지는 알림함을 건드리지 않아요", async () => {
  const ui = setup();
  await ui.receive({ type: "other-message", test: true });
  await ui.receive(undefined);
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.badge.hidden, true);
});

test("점검용 푸시도 서버 알림함을 조회하고 서버에 없는 알림 개수를 만들어 내지 않아요", async () => {
  const ui = setup({ initialNotes: [note("existing")] });
  await ui.load();
  await ui.receive({ type: "push-received", test: true, error: "display failed" });

  assert.equal(ui.calls.length, 2, "점검용 푸시도 최신 서버 상태를 조회해요");
  assert.ok(ui.calls.every((call) => call.method === "GET"));
  assert.equal(ui.badge.textContent, "1");
  assert.equal(ui.getServerNotes().length, 1);

  ui.replaceServerNotes([]);
  await ui.receive({ type: "push-received", test: true });
  assert.equal(ui.calls.length, 3);
  assert.equal(ui.badge.textContent, "0", "푸시 이벤트 수와 관계없이 서버의 개수를 반영해요");
  assert.equal(ui.badge.hidden, true);
});

test("상세를 열어 둔 스터디의 새 푸시도 자동으로 읽지 않고 안 읽은 개수를 유지해요", async () => {
  const ui = setup({ hash: "#/s/study-open" });
  await ui.load();
  ui.replaceServerNotes([note("open", { studyId: "study-open" }), note("other")]);

  await ui.receive({ type: "push-received", test: false });

  assert.equal(ui.calls.length, 2, "초기 조회와 수신 후 조회만 보내요");
  assert.ok(ui.calls.every((call) => call.method === "GET"));
  assert.equal(ui.getServerNotes().find((n) => n.id === "open").read, false);
  assert.equal(ui.getServerNotes().find((n) => n.id === "other").read, false);
  assert.equal(ui.badge.textContent, "2");
  assert.equal(ui.badge.hidden, false);
  assert.match(ui.notePanel.innerHTML, /class="inbox-item unread" data-note="open"/);
});

test("숨겨진 상세 탭은 알림을 조회하거나 푸시를 받아도 읽음 요청을 보내지 않아요", async () => {
  const ui = setup({
    hash: "#/s/study-open",
    initialNotes: [note("open", { studyId: "study-open" }), note("other")],
  });
  await ui.visibility("hidden");
  await ui.load();
  await ui.receive({ type: "push-received", test: false });

  assert.equal(ui.calls.length, 2);
  assert.ok(ui.calls.every((call) => call.method === "GET"));
  assert.ok(ui.getServerNotes().every((n) => n.read === false));
  assert.equal(ui.badge.textContent, "2");
});

test("사용자가 상세에 명시적으로 진입하면 해당 스터디의 알림만 읽음 처리해요", async () => {
  const ui = setup({ initialNotes: [note("open", { studyId: "study-open" }), note("other")] });
  await ui.load();
  ui.setHash("#/s/study-open");
  await ui.readOpenStudy();

  assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[1].method, "PATCH");
  assert.deepEqual(ui.calls[1].body.ids, ["open"]);
  assert.equal(ui.getServerNotes().find((n) => n.id === "open").read, true);
  assert.equal(ui.getServerNotes().find((n) => n.id === "other").read, false);
  assert.equal(ui.badge.textContent, "1");
  assert.match(ui.notePanel.innerHTML, /class="inbox-item" data-note="open"/);
});

test("숨겨진 탭에서 상세 읽음 처리를 호출해도 알림을 소비하지 않아요", async () => {
  const ui = setup({ initialNotes: [note("open", { studyId: "study-open" })] });
  await ui.load();
  ui.setHash("#/s/study-open");
  await ui.visibility("hidden");
  await ui.readOpenStudy();

  assert.equal(ui.calls.length, 1, "초기 GET 이후 PATCH를 보내지 않아야 해요");
  assert.equal(ui.getServerNotes()[0].read, false);
  assert.equal(ui.badge.textContent, "1");
});

test("로그아웃 상태의 푸시는 인증된 알림 조회를 만들지 않아요", async () => {
  const ui = setup({ signedIn: false });
  await ui.receive({ type: "push-received", test: false });
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.noteBtn.hidden, true);
  assert.equal(ui.badge.hidden, true);
});

test("숨겨진 탭에서는 조회하지 않고, 복귀 시 상태 동기화를 건너뛰어도 알림은 한 번 갱신해요", async () => {
  const ui = setup({ initialNotes: [note("missed")], syncResult: false });
  await ui.visibility("hidden");
  assert.equal(ui.getSyncCalls(), 0);
  assert.equal(ui.calls.length, 0);

  await ui.visibility("visible");
  assert.equal(ui.getSyncCalls(), 1);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].method, "GET");
  assert.equal(ui.badge.textContent, "1");
  assert.match(ui.notePanel.innerHTML, /알림 missed/);
});

test("탭 복귀 시 상태 동기화가 알림까지 갱신했다면 같은 알림을 두 번 조회하지 않아요", async () => {
  const ui = setup({ initialNotes: [note("synced")], syncResult: true });
  await ui.visibility("visible");
  assert.equal(ui.getSyncCalls(), 1);
  assert.equal(ui.calls.length, 1, "syncState가 맡은 조회에 추가 GET 요청을 보내지 않아요");
  assert.equal(ui.badge.textContent, "1");
  assert.match(ui.notePanel.innerHTML, /알림 synced/);
});
