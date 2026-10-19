# 스터디 매칭보드

기수원 40명이 관심 도메인을 기준으로 개발·디자인·PO·마케터가 섞인 팀을 꾸리게 돕는 매칭보드예요.
기획안: `스터디_매칭보드_기획안.pdf` (@우현, 2026-10-19)

## 화면

| 화면 | 주소 | 누가 쓰나 |
|---|---|---|
| 매칭보드 메인 (나에게 맞는 팀 3개, 도메인별 팀 카드) | `#/` | 모두 |
| 프로필 등록 | `#/profile` | 기수원 |
| 팀 상세·지원 (지원, 상태, 팀장의 수락·거절) | `#/team/t1` | 기수원, 팀장 |
| 운영진 관리 (팀 수, 정원표, 미배정 인원, 자동 배치, 확정) | `#/admin` | 운영진 |

로그인 대신 오른쪽 위 **"지금 보는 사람"**에서 운영진이나 기수원(팀장 포함)을 골라요. 데이터는 이 브라우저(localStorage)에만 저장돼요.

## 실행

```bash
npx serve .          # 또는 python3 -m http.server 3000
npm test             # 기획안 규칙 검사 (Node 20 이상)
```

배포는 Vercel(정적 사이트)이에요. 파일을 더블클릭해서 열면 데이터 파일을 못 읽어요. 위처럼 서버로 열어 주세요.

## 기획안 체크리스트

| 항목 | 확인 |
|---|---|
| R1~R8 구현 | 화면 4개 + `npm test` |
| 테스트 데이터 40명을 그대로 넣어 동작 | `data/matching_test_members.csv` 그대로 읽어요 |
| 팀 수 6일 때 정원표가 7장 예시와 같음 | 테스트 + 운영진 화면 |
| 추천 상위 3개가 7장 점수 규칙대로 | 테스트 + 추천 카드에 점수 내역 표시 |
| 확정 후 개발자가 한 팀에 4명 이상 안 몰림 | 테스트 (자동 배치 후 최대 3명) |

## 가정 사항

- 기획안의 `matching_test_data.json`(팀 정보)을 받지 못해서 `data/teams.json`을 만들었어요.
  - 도메인: 1·2팀 에듀테크, 3팀 헬스케어, 4팀 커머스, 5팀 라이프스타일, 6팀 핀테크 (기획안 5장)
  - 주요 시간대: 그 도메인을 1순위로 고른 사람들이 가장 많이 고른 시간대 2개
  - 팀장: 그 도메인을 1순위로 고른 PO 중 번호가 가장 작은 사람. 팀장은 처음부터 그 팀 소속이에요.
  - JSON을 받으면 이 파일만 바꾸면 돼요.
- 동점일 때 "빈 칸이 더 많은 팀"은 그 팀의 **모든 역할** 빈 칸 합으로 봤어요.
- "선택" 칸은 그 역할이 없어도 되는 칸이라 지원을 받지 않아요.
- 수락되면 그 사람의 다른 대기 지원은 자동으로 거절돼요(한 사람은 한 팀에만, R8).
- 자동 배치는 미배정 인원을 번호 순으로 추천 1위 팀에 넣어요.

## 공지용 스터디 모집 버전 (`/recruit/`)

10월 파이썬 스터디 공지처럼 **구성원이 직접 스터디를 열고, 다른 사람이 신청하는** 버전이에요. 기획안 버전은 `v1-기획안` 태그로 고정했어요.

| 화면 | 주소 |
|---|---|
| 스터디 목록 (주제 칩, 모집 중만, 내 직군이 비어 있는 스터디) | `/recruit/#/` |
| 스터디 열기 (이름·요일·목표, 권장 주제는 선택, 정원 2~6명, ZEP/오프라인) | `/recruit/#/new` |
| 스터디 상세 (신청, 모집자의 수락·거절, 모집 마감, 결성 다음 할 일) | `/recruit/#/s/s1` |
| 내 스터디 (내가 연 것, 신청한 것) | `/recruit/#/my` |

- 스터디를 열거나 신청하려면 **구글 로그인**이 필요해요. 처음 로그인할 때만 보여 줄 이름과 직군을 정하고, 다음에 같은 계정으로 들어오면 프로필이 이어져요. 오른쪽 위 버튼에서 이름·직군을 고치거나 로그아웃해요.
- 주 횟수는 따로 받지 않고 고른 요일 수로 정해요(화·목 → 주 2회).
- 권장 주제(강사님 주제1~7)는 고르지 않아도 돼요. 다른 주제면 스터디 이름에 적어요.
- 구글 로그인은 클라이언트 ID(공개값)만 써요. 시크릿은 쓰지 않아요. 서버 함수가 쓰기 요청마다 구글 ID 토큰을 `google-auth-library`의 `verifyIdToken`으로 검증하고, 확인된 계정 번호로 `"me-g"+sub`를 내 id로 써요.
- 구글 앱은 "프로덕션"으로 게시해서 구글 계정이 있으면 누구나 로그인돼요(기본 범위 openid·email·profile만 써서 구글 인증 심사는 필요 없어요). 개인정보처리방침: `/privacy.html`
- 예시 데이터 없이 빈 목록으로 시작해요. 테스트 데이터는 `test/recruit.test.js` 안에만 있어요.
- 스터디·신청·프로필은 **Vercel Storage(Upstash Redis, 무료 플랜, 도쿄)**에 저장해서 여러 사람이 같은 목록을 봐요. 브라우저에는 로그인 토큰만 만료(1시간)까지 둬요.

### 서버 함수 (`/api/recruit/*`)

| 요청 | 하는 일 | 누가 |
|---|---|---|
| `GET /api/recruit/state` | 스터디·신청·사람(이름·직군) 전체 | 누구나 |
| `GET /api/recruit/me` · `PUT /api/recruit/me` | 내 프로필 보기 · 이름과 직군 저장 | 로그인한 나 |
| `POST /api/recruit/studies` | 스터디 열기 | 로그인 + 프로필 |
| `PATCH /api/recruit/studies/:id` `{ closed: true }` | 모집 마감 | 모집자만 |
| `POST /api/recruit/apps` `{ studyId, message }` | 신청 | 로그인 + 프로필 |
| `PATCH /api/recruit/apps/:id` `{ status }` | 수락·거절 | 모집자만 |

- 규칙은 화면과 같은 `recruit/recruit-logic.js`를 서버에서도 그대로 써요. 모집자 확인도 `canManage`로 서버에서 막아요.
- 같은 스터디의 신청·수락·마감은 Redis 잠금으로 한 번에 하나씩 처리해서 동시에 눌러도 정원을 넘지 않아요.
- Redis 키는 `recruit:prod:…`(배포), `recruit:development:…`(vercel dev)처럼 환경마다 나뉘어 있어서 로컬 확인이 실제 데이터와 섞이지 않아요.

```bash
vercel env pull .env.local                               # Redis 환경변수 받기 (.env*는 git에 올리지 않아요)
npm test                                                 # 규칙·서버 함수 테스트 (메모리 저장소)
node --env-file=.env.local --test test/recruit-redis.test.js   # 실제 Redis로 저장·읽기 확인
RECRUIT_DEV_AUTH=1 vercel dev                            # 로컬 확인: "dev:<번호>:<이름>" 토큰으로 두 사람 흐름 확인 (배포에서는 꺼져 있어요)
```

## 사용한 스킬과 프롬프트

- `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max`, MIT): 빈 상태·로딩·칩·터치 크기 점검
  - `search.py "study group matching community students" --design-system`
  - `search.py "touch target size chip" --domain ux`, `"filter chips toggle state"`, `"loading skeleton empty state"`
- 프롬프트(서버 저장): "/recruit/ 모집 버전의 데이터를 localStorage에서 Vercel Storage(Upstash Redis, 무료 플랜)로 옮겨 줘. /api 서버 함수에서 구글 ID 토큰을 검증하고, 규칙은 recruit-logic.js를 서버에서도 그대로 쓰고, 모집자만 수락·거절·마감하게 서버에서 막아 줘."
- 프롬프트(모집 버전): "같은 레포에 /recruit/ 폴더로 공지용 스터디 모집 버전을 만들어 줘. 기획안 버전은 v1-기획안 태그로 고정하고, 우선 브라우저 저장으로 17시까지 만들어 줘"
- 프롬프트(기획안 버전): "첨부한 스터디 매칭보드 기획안과 matching_test_members.csv를 기준으로, 원티드 Montage 토큰을 써서 화면 4개(R1~R8)를 순수 HTML로 만들고, 7장 규칙은 테스트로 확인해 줘."

## 사용한 오픈소스

- [Montage](https://github.com/wanteddev/montage-web) 디자인 토큰 — MIT
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — MIT
- [Pretendard](https://github.com/orioncactus/pretendard) — OFL

원티드와 관련 없는 실습 프로젝트예요.
