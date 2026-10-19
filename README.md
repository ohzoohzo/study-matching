# 스터디 매칭보드

기수원 40명이 관심 도메인을 기준으로 개발·디자인·PO·마케터가 섞인 팀을 꾸리게 돕는 매칭보드예요.
기획안: `스터디_매칭보드_기획안.pdf` (@우현, 2026-10-19)

## 주소

| 주소 | 무엇 |
|---|---|
| `/` | **스터디 모집 (메인)**: 구성원이 스터디를 열고 신청해요. 아래 "스터디 모집"을 봐요. |
| `/v1/` | 기획안 버전 매칭보드 (백업, `v1-기획안` 태그와 같은 내용) |
| `/recruit/` | 예전 모집 버전 주소. `/`로 넘어가요(`#/s/…` 같은 뒷부분은 그대로 이어져요). |

## 기획안 버전 화면 (`/v1/`, 백업)

| 화면 | 주소 | 누가 쓰나 |
|---|---|---|
| 매칭보드 (나에게 맞는 팀 3개, 도메인별 팀 카드) | `/v1/#/` | 모두 |
| 프로필 등록 | `/v1/#/profile` | 기수원 |
| 팀 상세·지원 (지원, 상태, 팀장의 수락·거절) | `/v1/#/team/t1` | 기수원, 팀장 |
| 운영진 관리 (팀 수, 정원표, 미배정 인원, 자동 배치, 확정) | `/v1/#/admin` | 운영진 |

로그인 대신 오른쪽 위 **"지금 보는 사람"**에서 운영진이나 기수원(팀장 포함)을 골라요. 데이터는 이 브라우저(localStorage)에만 저장돼요.

## 실행

```bash
npm run local        # vercel dev: 메인(스터디 모집)과 /api 서버 함수를 함께 띄워요 (vercel env pull .env.local 먼저)
npx serve .          # 기획안 버전(/v1/)만 볼 때는 정적 서버로도 돼요
npm test             # 기획안·모집 규칙과 서버 함수 검사 (Node 20 이상)
```

배포는 Vercel(정적 파일 + /api 서버 함수)이에요. 파일을 더블클릭해서 열면 데이터 파일을 못 읽어요. 위처럼 서버로 열어 주세요.

## 기획안 체크리스트

| 항목 | 확인 |
|---|---|
| R1~R8 구현 | 화면 4개 + `npm test` |
| 테스트 데이터 40명을 그대로 넣어 동작 | `v1/data/matching_test_members.csv` 그대로 읽어요 |
| 팀 수 6일 때 정원표가 7장 예시와 같음 | 테스트 + 운영진 화면 |
| 추천 상위 3개가 7장 점수 규칙대로 | 테스트 + 추천 카드에 점수 내역 표시 |
| 확정 후 개발자가 한 팀에 4명 이상 안 몰림 | 테스트 (자동 배치 후 최대 3명) |

## 가정 사항

- 기획안의 `matching_test_data.json`(팀 정보)을 받지 못해서 `v1/data/teams.json`을 만들었어요.
  - 도메인: 1·2팀 에듀테크, 3팀 헬스케어, 4팀 커머스, 5팀 라이프스타일, 6팀 핀테크 (기획안 5장)
  - 주요 시간대: 그 도메인을 1순위로 고른 사람들이 가장 많이 고른 시간대 2개
  - 팀장: 그 도메인을 1순위로 고른 PO 중 번호가 가장 작은 사람. 팀장은 처음부터 그 팀 소속이에요.
  - JSON을 받으면 이 파일만 바꾸면 돼요.
- 동점일 때 "빈 칸이 더 많은 팀"은 그 팀의 **모든 역할** 빈 칸 합으로 봤어요.
- "선택" 칸은 그 역할이 없어도 되는 칸이라 지원을 받지 않아요.
- 수락되면 그 사람의 다른 대기 지원은 자동으로 거절돼요(한 사람은 한 팀에만, R8).
- 자동 배치는 미배정 인원을 번호 순으로 추천 1위 팀에 넣어요.

## 스터디 모집 (메인, `/`)

10월 파이썬 스터디 공지처럼 **구성원이 직접 스터디를 열고, 다른 사람이 신청하는** 버전이에요. 화면 파일은 루트 `index.html`, 코드는 `recruit/`(화면 `recruit.js`, 규칙 `recruit-logic.js`)에 있어요. 기획안 버전은 `v1-기획안` 태그로 고정했고 `/v1/`에 백업해 뒀어요.

| 화면 | 주소 |
|---|---|
| 스터디 목록 (활기 숫자 칸, 검색: 스터디 이름·목표·모집자 이름, 모집 중만, 내 직군이 비어 있는 스터디) | `/#/` |
| 스터디 열기 (이름·요일·진행 시간대(선택)·일정(모집 마감일·시작일·종료일, 선택)·목표, 정원 2~6명, ZEP/오프라인) | `/#/new` |
| 스터디 상세 (신청 + 내가 가능한 시간대(선택)·신청 취소·스스로 나가기, 모집자의 시간대 겹침 요약·수락·거절·내보내기·모집 마감·다시 열기·모집 취소, 결성 다음 할 일) | `/#/s/s-1` |
| 내 스터디 (내가 연 것: 바로 마감·다시 열기 / 신청한 것: 대기 중이면 신청 취소, 수락됐으면 나가기, 모집자가 취소한 스터디는 "스터디 취소됨") | `/#/my` |

- 스터디를 열거나 신청하려면 **구글 로그인**이 필요해요. 처음 로그인할 때만 보여 줄 이름과 직군을 정하고, 다음에 같은 계정으로 들어오면 프로필이 이어져요. 오른쪽 위 버튼에서 이름·직군을 고치거나 로그아웃해요.
- 주 횟수는 따로 받지 않고 고른 요일 수로 정해요(화·목 → 주 2회).
- 일정(모집 마감일·스터디 시작일·종료일)은 모두 선택이에요. 시작일 ≤ 종료일, 모집 마감일 ≤ 종료일이어야 하고, 열 때 모집 마감일·종료일은 오늘(한국 시간)이거나 뒤여야 해요. 모집 마감일 당일까지 신청을 받고 다음 날부터 자동으로 "마감"이 돼요(대기 신청은 그 뒤에도 수락할 수 있어요). 모집자가 "다시 열기"를 누르면 지난 마감일을 지우고 열어요. 모집 중인 카드에는 "마감 D-3"·"오늘 마감"이 보여요.
- 시간대는 기획안과 같은 6개(평일 낮·저녁·밤, 주말 오전·오후·저녁)예요. 스터디를 열 때 진행 시간대를, 신청할 때 내가 가능한 시간대를 여러 개 고를 수 있고, 둘 다 안 골라도 돼요(안 고른 스터디는 "시간은 모여서 정해요"). 고른 요일에 맞는 시간대만 보여요(화·목 → 평일 셋). 모집자 상세 화면에는 시간대마다 수락된 사람·대기 중인 사람이 몇 명인지 겹침 요약이 보여요.
- 모집 취소는 스터디를 지우지 않고 `canceled`로 남겨요. 목록·검색에서 빠지고, 함께하기로 했거나 대기 중이던 사람은 "내 스터디"와 상세 화면에서 "모집자가 취소했어요"를 봐요. 되돌릴 수 없어서 확인 창을 먼저 띄워요.
- 신청 취소는 대기 중인 신청만 할 수 있고, 신청을 `withdrawn`으로 남겨요. 모집자 화면에서 빠지고, 나중에 다시 신청할 수 있어요.
- **활기 숫자**: 목록 맨 위에 가입한 사람(직군별), 모집 중인 스터디, 스터디에 함께하는 사람, 최근 7일 새 스터디를 숫자로 보여 줘요. 이름은 보여 주지 않고, 계산은 `recruit-logic.js`의 `activityStats`가 해요.
- **사이트 알림함**: 메뉴의 종 아이콘에 안 읽은 알림 개수가 보이고, 누르면 최근 알림 30개가 열려요. 알림을 누르거나 그 스터디 상세를 열면 읽음이 돼요(푸시를 눌러 들어와도 읽음). 푸시를 켜지 않았어도 알림함에는 쌓여요.
- **브라우저 푸시 알림**: 오른쪽 위 프로필 창에서 "이 기기에서 알림 받기"를 누르면 사이트를 닫아 둬도 알림이 와요. 모집자는 새 신청·신청 취소·나감을, 신청자는 수락·거절·내보내짐·모집 취소를 받아요. 알림을 누르면 그 스터디로 가요. 아이폰·아이패드는 사파리에서 "홈 화면에 추가"한 앱에서만 켤 수 있어요. 알림을 못 보내도 신청·수락 같은 동작은 그대로 돼요.
- 수락된 사람은 스스로 나갈 수 있어요(`left`, 다시 신청 가능). 모집자는 수락된 사람을 내보낼 수 있어요(`removed`, 같은 스터디에 다시 신청 불가). 둘 다 자리가 하나 비고, 되돌릴 수 없어서 확인 창을 먼저 띄워요. 대기 중인 신청은 나가기 대신 신청 취소, 내보내기 대신 거절을 써요.
- 권장 주제(강사님 주제1~7) 고르기는 뺐어요. 무엇을 공부하는지는 스터디 이름에 적어요.
- 구글 로그인은 클라이언트 ID(공개값)만 써요. 시크릿은 쓰지 않아요. 서버 함수가 쓰기 요청마다 구글 ID 토큰을 `google-auth-library`의 `verifyIdToken`으로 검증하고, 확인된 계정 번호로 `"me-g"+sub`를 내 id로 써요.
- 구글 앱은 "프로덕션"으로 게시해서 구글 계정이 있으면 누구나 로그인돼요(기본 범위 openid·email·profile만 써서 구글 인증 심사는 필요 없어요). 개인정보처리방침: `/privacy.html`
- 예시 데이터 없이 빈 목록으로 시작해요. 테스트 데이터는 `test/recruit.test.js` 안에만 있어요.
- 스터디·신청·프로필은 **Vercel Storage(Upstash Redis, 무료 플랜, 도쿄)**에 저장해서 여러 사람이 같은 목록을 봐요. 브라우저에는 로그인 토큰만 만료(1시간)까지 둬요.

### 서버 함수 (`/api/recruit/*`)

| 요청 | 하는 일 | 누가 |
|---|---|---|
| `GET /api/recruit/state` | 스터디·신청·사람(이름·직군) 전체 | 누구나 |
| `GET /api/recruit/me` · `PUT /api/recruit/me` | 내 프로필 보기 · 이름과 직군 저장 | 로그인한 나 |
| `POST /api/recruit/studies` `{ title, days, times?, mode, capacity, goal, deadline?, startDate?, endDate? }` | 스터디 열기 (times: 진행 시간대, 일정: "2026-10-25" 모양, 모두 선택) | 로그인 + 프로필 |
| `PATCH /api/recruit/studies/:id` `{ closed: true }` · `{ closed: false }` · `{ canceled: true }` | 모집 마감 · 다시 열기 · 모집 취소(되돌릴 수 없어요) | 모집자만 |
| `POST /api/recruit/apps` `{ studyId, message, times? }` | 신청 (times: 내가 가능한 시간대, 선택) | 로그인 + 프로필 |
| `PATCH /api/recruit/apps/:id` `{ status: "accepted" \| "rejected" }` | 수락·거절 | 모집자만 |
| `PATCH /api/recruit/apps/:id` `{ status: "withdrawn" }` | 신청 취소 (대기 중일 때만) | 신청한 본인만 |
| `PATCH /api/recruit/apps/:id` `{ status: "left" }` | 스스로 나가기 (수락된 뒤) | 수락된 본인만 |
| `PATCH /api/recruit/apps/:id` `{ status: "removed" }` | 내보내기 (수락된 사람) | 모집자만 |
| `GET /api/recruit/notes` · `PATCH /api/recruit/notes` `{ ids }` 또는 `{ all: true }` | 내 알림함(최근 30개)과 안 읽은 개수 · 읽음으로 바꾸기 | 로그인한 나 |
| `GET /api/recruit/push` | 알림 공개키와 알림이 켜진 서버인지(`enabled`) | 누구나 |
| `POST /api/recruit/push` `{ subscription }` · `DELETE /api/recruit/push` `{ endpoint }` | 이 기기 알림 켜기·끄기 (브라우저 회사의 푸시 서버 주소만 받아요, 한 사람에 5대까지) | 로그인한 나 |

- 규칙은 화면과 같은 `recruit/recruit-logic.js`를 서버에서도 그대로 써요. 모집자 확인도 `canManage`로 서버에서 막아요.
- 같은 스터디의 신청·수락·마감·다시 열기·모집 취소·신청 취소는 Redis 잠금으로 한 번에 하나씩 처리해서, 동시에 눌러도 정원을 넘지 않고 수락과 신청 취소가 겹치지 않아요.
- Redis 키는 `recruit:prod:…`(배포), `recruit:development:…`(vercel dev)처럼 환경마다 나뉘어 있어서 로컬 확인이 실제 데이터와 섞이지 않아요.
- 푸시 구독은 `recruit:<환경>:subs`, 알림함은 `recruit:<환경>:notes`에 사람별로 두고, 공개 목록(`GET /api/recruit/state`)에는 넣지 않아요. 누구에게 무엇을 보낼지는 `recruit-logic.js`의 `pushMessages`가 정하고, 같은 알림을 알림함에 저장한 뒤 푸시로 보내요.
- 푸시를 켜려면 Vercel 환경변수에 `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`를 넣어요(`npx web-push generate-vapid-keys`로 만들어요). 없으면 알림 칸에 "준비 중"이 보이고 다른 기능은 그대로예요. 비밀키는 코드에 넣지 않아요.

```bash
vercel env pull .env.local                               # Redis 환경변수 받기 (.env*는 git에 올리지 않아요)
npm test                                                 # 규칙·서버 함수 테스트 (메모리 저장소)
node --env-file=.env.local --test test/recruit-redis.test.js   # 실제 Redis로 저장·읽기 확인
RECRUIT_DEV_AUTH=1 vercel dev                            # 로컬 확인: "dev:<번호>:<이름>" 토큰으로 두 사람 흐름 확인 (배포에서는 꺼져 있어요)
set -a; . ./.env.local; set +a; RECRUIT_DEV_AUTH=1 vercel dev   # .env.local의 VAPID 키까지 쓰려면 이렇게 띄워요
```

## 사용한 스킬과 프롬프트

- 활기 숫자 (feat/recruit-stats)
  - 스킬: `superpowers:brainstorming`(이름 목록 대신 숫자로 보여 주기로 정함), `dataviz`(차트가 아니라 큰 숫자 칸(KPI row)으로, 글자는 글자색 토큰·비례 숫자), `superpowers:test-driven-development`, `superpowers:verification-before-completion`
  - 프롬프트: "가입된 사용자 목록을 보여 주는 기능은 어때? 사람들이 많이 사용하고 있구나가 시각화돼야 좀 사용하지 않을까" → "그렇게 하자 숫자로 활기를 보여 주는 식으로"
- 사이트 알림함 (feat/recruit-notes)
  - 스킬: `superpowers:brainstorming`(푸시만 두면 생기는 빈틈과 알림함을 함께 두는 방식을 정함), `superpowers:test-driven-development`, `superpowers:verification-before-completion`
  - 프롬프트: "사이트 내 알림이랑 연동되게 해야 되는 거 아니야?" → "응 그렇게 해"
- 브라우저 푸시 알림 (feat/recruit-push)
  - 스킬: `superpowers:brainstorming`(슬랙 연동·사이트 안 알림·브라우저 푸시 중 고르기), `superpowers:test-driven-development`, `superpowers:verification-before-completion`
  - 프롬프트: "그리고 slack 채널에 메시지 보내기도 연동할까? 그러면 돈 들어?" → "슬랙까지는 하지 말자" → "알림 기능 하면 웹에서 알림 오는 거지?" → "브라우저 푸시 알림"
- 나가기·내보내기 (feat/recruit-leave)
  - 스킬: `superpowers:brainstorming`(거절과 내보내기의 차이, 상태를 따로 둘지 정함), `superpowers:test-driven-development`, `superpowers:verification-before-completion`
  - 프롬프트: "그리고 신청자 거절도 가능하게 할까?" → "수락한 사람 내보내기가 거절 아니야?" → "스스로 나가기 만들고 수락한 사람 내보내기도 만들어"
- 일정 (feat/recruit-dates)
  - 스킬: `superpowers:brainstorming`(분야·태그·시작일·마감일 중 무엇을 넣을지 사용자와 정함), `superpowers:test-driven-development`, `superpowers:verification-before-completion`
  - 프롬프트: "분야, 태그, 시작 마감일 등 기능도 넣을까?" → "일단 모집 마감일이랑 스터디 시작일 마감일 설정 가능하게 해"
  - 분야·태그는 검색과 겹치고, 앞에서 뺀 권장 주제 고르기를 다시 넣는 셈이라 이번에는 넣지 않았어요.
- 시간대 (feat/recruit-times)
  - 스킬: `superpowers:brainstorming`(스터디·신청자 시간대를 선택 칸으로 둘지, 요일마다 다른 시간대를 둘지 사용자와 정함), `superpowers:test-driven-development`, `superpowers:verification-before-completion`
  - 프롬프트: "가능한 시간대(평일 낮·저녁·밤, 주말 오전·오후·저녁) 기능도 넣자. 모임의 자유도를 너무 빼앗고 있는 건가?" → "추천한 안(스터디 진행 시간대 선택, 신청할 때 가능한 시간대 선택, 모집자에게 겹침 요약) 그대로 만들어 줘. 새 브랜치에서 테스트 먼저 쓰고, PR까지 올려 줘."
  - 요일마다 다른 시간대를 고르는 안은 화면·규칙이 무거워지고 "모여서 정해요" 여지를 줄여서 이번에는 넣지 않았어요.
- 검색·모집 취소·신청 취소·다시 열기·내 스터디에서 마감 (feat/recruit-basics)
  - 스킬: `superpowers:brainstorming`(사용자가 질문을 건너뛰고 범위를 맡김), `superpowers:using-git-worktrees`, `superpowers:test-driven-development`(규칙·서버 테스트를 먼저 쓰고 실패를 본 뒤 구현), `superpowers:verification-before-completion`, `ui-ux-pro-max`
  - `search.py "search input filter no results" --domain ux`, `"confirmation dialog destructive action"`, `"modal dialog focus keyboard"`, `"empty state clear filters"`, `"live region announce results count"`
  - 프롬프트: "스터디 모집에 기본 기능을 더해 주세요. (a) 검색: 스터디 이름·목표·모집자 이름 글자로 찾기, 기존 필터와 함께, 결과가 없으면 안내와 필터 지우기 (b) 모집 취소 (c) 신청 취소 (d) 마감한 스터디 다시 열기 (e) 내 스터디에서 바로 마감. 규칙은 recruit-logic.js에 테스트 먼저, 서버는 canManage와 store.withLock으로 막고, 되돌릴 수 없는 동작은 확인 창을 먼저 띄워요." → "질문은 건너뛰고, 범위와 취소 방식은 네가 정해서 바로 시작해 줘."
- `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max`, MIT): 빈 상태·로딩·칩·터치 크기 점검
  - `search.py "study group matching community students" --design-system`
  - `search.py "touch target size chip" --domain ux`, `"filter chips toggle state"`, `"loading skeleton empty state"`
- 프롬프트(메인 옮기기): "http://localhost:3123/recruit 이걸 메인 페이지(http://localhost:3123/)로 옮기고, 원래 있던 건 어디 백업해"
- 프롬프트(권장 주제 빼기): "권장 주제 파트는 제거해"
- 프롬프트(서버 저장): "/recruit/ 모집 버전의 데이터를 localStorage에서 Vercel Storage(Upstash Redis, 무료 플랜)로 옮겨 줘. /api 서버 함수에서 구글 ID 토큰을 검증하고, 규칙은 recruit-logic.js를 서버에서도 그대로 쓰고, 모집자만 수락·거절·마감하게 서버에서 막아 줘."
- 프롬프트(모집 버전): "같은 레포에 /recruit/ 폴더로 공지용 스터디 모집 버전을 만들어 줘. 기획안 버전은 v1-기획안 태그로 고정하고, 우선 브라우저 저장으로 17시까지 만들어 줘"
- 프롬프트(기획안 버전): "첨부한 스터디 매칭보드 기획안과 matching_test_members.csv를 기준으로, 원티드 Montage 토큰을 써서 화면 4개(R1~R8)를 순수 HTML로 만들고, 7장 규칙은 테스트로 확인해 줘."

## 사용한 오픈소스

- [Montage](https://github.com/wanteddev/montage-web) 디자인 토큰 — MIT
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — MIT
- [Pretendard](https://github.com/orioncactus/pretendard) — OFL

원티드와 관련 없는 실습 프로젝트예요.
