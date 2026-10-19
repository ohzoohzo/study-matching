// 스터디 모집 서버 동작. 규칙 판단은 화면과 같은 recruit/recruit-logic.js가 하고, 여기서는 확인·저장만 해요.
// 쓰기는 모두 로그인한 사람(user: 서버가 확인한 구글 계정)으로만 해요. 화면이 보낸 사람 id는 믿지 않아요.
// 쓰고 나면 바뀐 전체 상태(state)를 함께 돌려줘서 화면이 한 번 더 부르지 않아도 돼요.
import * as R from "../../recruit/recruit-logic.js";
import { HttpError } from "./errors.js";

const text = (v) => (typeof v === "string" ? v : "");
const invalid = (fields, message) => {
  if (Object.keys(fields).length) throw new HttpError(400, message, fields);
};
// recruit-logic이 막은 이유("정원이 다 찼어요" 등)를 그대로 409로 돌려줘요
function rule(fn) {
  try { return fn(); } catch (e) { throw new HttpError(409, e.message); }
}
function needPerson(state, user) {
  const p = state.people.find((x) => x.id === user.id);
  if (!p) throw new HttpError(403, "먼저 보여 줄 이름과 직군을 저장해 주세요.");
  return p;
}
function needStudy(state, id) {
  const s = state.studies.find((x) => x.id === id);
  if (!s) throw new HttpError(404, "찾는 스터디가 없어요.");
  return s;
}
function needLeader(study, user) {
  const c = R.canManage(study, user.id);
  if (!c.ok) throw new HttpError(403, c.reason);
}
// 한국 시간 "2026-10-19T17:05" (목록 정렬에 써요)
const kstMinute = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16);
const replace = (list, item) => list.map((x) => (x.id === item.id ? item : x));

export function getState(store) {
  return store.load();
}

export async function getMe(store, user) {
  const state = await store.load();
  return {
    person: state.people.find((p) => p.id === user.id) || null,
    account: { sub: user.sub, name: user.name, email: user.email, exp: user.exp },
  };
}

export async function saveMe(store, user, body) {
  const person = { id: user.id, name: text(body.name).trim(), role: text(body.role) };
  invalid(R.validateProfile(person), "이름과 직군을 확인해 주세요.");
  const state = await store.load();
  await store.put("people", person);
  const known = state.people.some((p) => p.id === person.id);
  return { person, state: { ...state, people: known ? replace(state.people, person) : state.people.concat(person) } };
}

export async function createStudy(store, user, body) {
  const state = await store.load();
  needPerson(state, user);
  const days = Array.isArray(body.days) ? body.days.map(String) : [];
  const s = { topic: text(body.topic), title: text(body.title).trim(), days, mode: text(body.mode), capacity: Number(body.capacity), goal: text(body.goal).trim() };
  invalid(R.validateStudy(s), "입력한 내용을 확인해 주세요.");
  const study = { id: await store.nextId("s"), ...s, days: R.DAYS.filter((d) => days.includes(d)), leaderId: user.id, closed: false, createdAt: kstMinute() };
  await store.put("studies", study);
  return { study, state: { ...state, studies: state.studies.concat(study) } };
}

export async function closeStudy(store, user, id, body) {
  if (body.closed !== true) throw new HttpError(400, "모집 마감만 할 수 있어요.");
  return store.withLock("study:" + id, async () => {
    const state = await store.load();
    const s = needStudy(state, id);
    needLeader(s, user);
    const study = R.closeStudy(s, user.id);
    await store.put("studies", study);
    return { study, state: { ...state, studies: replace(state.studies, study) } };
  });
}

export async function applyStudy(store, user, body) {
  const studyId = text(body.studyId);
  return store.withLock("study:" + studyId, async () => {
    const state = await store.load();
    const s = needStudy(state, studyId);
    needPerson(state, user);
    const c = R.canApply(s, state.apps, state.people, user.id);
    if (!c.ok) throw new HttpError(409, c.reason);
    const appId = await store.nextId("a");
    const apps = rule(() => R.apply(s, state.apps, state.people, user.id, appId, text(body.message)));
    const app = apps[apps.length - 1];
    await store.put("apps", app);
    return { app, state: { ...state, apps } };
  });
}

export async function decideApp(store, user, id, body) {
  const status = body.status;
  if (status !== "accepted" && status !== "rejected") throw new HttpError(400, "수락이나 거절만 할 수 있어요.");
  const found = await store.get("apps", id); // 어느 스터디를 잠글지 알려고 먼저 봐요
  if (!found) throw new HttpError(404, "찾는 신청이 없어요.");
  return store.withLock("study:" + found.studyId, async () => {
    const state = await store.load();
    const s = needStudy(state, found.studyId);
    needLeader(s, user);
    const apps = rule(() => R.decide(s, state.apps, state.people, id, status));
    const app = apps.find((x) => x.id === id);
    await store.put("apps", app);
    return { app, state: { ...state, apps } };
  });
}
