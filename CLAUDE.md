# 스터디 매칭 — 공통 규칙

모든 페이지와 API가 지키는 규칙입니다. 폴더별 CLAUDE.md(페이지 규칙)와 부딪히면 **이 파일이 이깁니다.**

## 사이트

함께 공부할 사람을 찾는 스터디 매칭 사이트예요. 모집글을 보고 → 신청하고 → 모집자가 수락하면 매칭돼요.

| 화면·부분 | 파일 | 담당 |
|---|---|---|
| 홈 (최신 스터디·필터) | `index.html` | ___ |
| 스터디 찾기 (목록·상세·신청) | `studies/` | ___ |
| 스터디 만들기 (모집글 쓰기) | `create/` | ___ |
| 내 스터디 (만든·신청한 스터디, 수락/거절) | `my/` | ___ |
| API·데이터 | `api/`, `data/` | ___ |

공통 파일(`CLAUDE.md`, `style.css`, `_틀.html`, `api/_lib/`) 담당: ___

## 폴더

```
study-matching/
├── CLAUDE.md            공통 규칙 (이 파일)
├── style.css            공통 스타일 (Montage 토큰 + Pretendard를 여기서 불러와요)
├── _틀.html             새 페이지 시작 틀 (메뉴·푸터·상태 처리 예시)
├── index.html           홈
├── studies/ create/ my/ 각자 index.html (+ 페이지 JS)
├── api/                 Vercel 서버 함수 (주소: /api/파일이름)
│   ├── studies.js       모집글 API 예시
│   └── _lib/store.js    데이터 읽고 쓰기는 여기 한 곳에서만
├── data/seed.json       처음 보여 줄 가상 데이터
├── test/                npm test로 API 규칙 검사
└── .claude/skills/ui-ux-pro-max/   UI/UX 점검 스킬
```

## 만들 때

- 화면은 **HTML·CSS·JavaScript**만 써요. 프레임워크와 빌드 도구는 쓰지 않아요.
- 서버는 **Vercel 서버 함수**(`api/*.js`)예요. 배포도 Vercel만 써요.
- 화면은 데이터를 **`fetch('/api/...')`로만** 받아요. 화면에서 `data/seed.json`을 직접 읽지 않아요.
- 데이터 읽고 쓰기는 `api/_lib/store.js`에서만 해요. 저장소를 바꿀 때(JSON → Vercel Storage의 Redis 또는 Postgres) 이 파일만 고쳐요.
  - Vercel 서버에서는 파일에 쓸 수 없어요. 저장 기능은 Vercel Storage를 연결한 뒤에 열어요.
- 링크와 파일 경로는 `/`로 시작하는 절대 경로를 써요 (`/style.css`, `/api/studies`, `/studies/`).
- 로컬 실행은 `npm run dev`(= `vercel dev`)예요. 파일을 더블클릭해서 열면 API가 동작하지 않아요.

## API

- 응답은 항상 JSON이에요. 실패하면 `{ "error": "사람이 읽을 수 있는 한국어 문장" }`과 알맞은 상태 코드(400·404·405·501 등)를 돌려줘요.
- 입력은 서버에서 검사하고, 틀린 칸마다 이유를 `fields`에 담아요.
- 새 규칙(예: 중복 신청 막기, 정원 초과 막기)을 만들면 `test/`에 테스트를 더하고 `npm test`가 통과해야 PR을 올려요.

| 주소 | 하는 일 | 상태 |
|---|---|---|
| `GET /api/studies` | 목록 (`?category=`, `?mode=`, `?open=1`) | 됨 |
| `GET /api/studies?id=s1` | 하나 보기 | 됨 |
| `POST /api/studies` | 모집글 만들기 | 입력 검사만 됨, 저장은 501 |
| `POST /api/apply` | 신청하기 | 아직 |
| `POST /api/apply/decide` | 수락·거절 | 아직 |

## 디자인

- **원티드 디자인 시스템 Montage**의 토큰만 써요. 색·글자·간격·모서리·그림자는 `var(--semantic-…)`, `var(--typography-…)`, `var(--spacing-…)`, `var(--radius-…)` 또는 `style.css`의 별칭(`--fg`, `--brand`, `--line` …)으로만 써요. 페이지에서 `#fff` 같은 색을 직접 쓰지 않아요.
- 글꼴은 **Pretendard**예요 (`style.css`가 불러와요).
- 공통 클래스를 먼저 써요: `.nav`, `.wrap`, `.page-head`, `.btn`, `.chip`, `.tag`, `.card`, `.input`, `.empty`, `.alert`, `.skeleton`, `.foot`.
- **이모지는 쓰지 않아요.** 아이콘은 Material Icons를 SVG로 넣어요.
- 메뉴와 푸터는 `_틀.html`에서 그대로 복사하고, 내 페이지 링크에만 `aria-current="page"`를 넣어요.
- 데이터를 쓰는 화면은 **불러오는 중 · 오류 · 빈 상태**를 모두 만들어요. 빈 상태에는 할 수 있는 행동(버튼)을 함께 둬요.
- 휴대폰 375px에서 가로 스크롤이 없어야 해요. 다크 모드는 Montage 토큰으로 자동 적용돼요.
- 키보드로 모든 버튼을 누를 수 있고 포커스가 보여야 해요. 움직임 줄이기 설정을 지켜요.

### UI/UX 점검 스킬 (ui-ux-pro-max)

화면을 만들거나 고칠 때 이 스킬로 UX를 점검해요.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "loading skeleton empty state" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "form inline validation error" --domain ux
```

- 스킬이 추천하는 **색·글꼴은 쓰지 않아요.** 이 사이트는 Montage 토큰과 Pretendard가 이겨요. 접근성·상태·폼·반응형 같은 **UX 규칙만** 가져와요.
- 스킬 문서의 `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...` 경로는 이 레포에서는 `.claude/skills/...`로 바꿔 실행해요.

## 내용

- 보이는 스터디·사람은 **가상 데이터**예요. 사람 이름 대신 가상 닉네임을 쓰고, 실제 연락처·이메일·주소는 넣지 않아요.
- 해요체로 쓰고, '최고·유일·100%' 같은 과장은 쓰지 않아요.
- 푸터에 Montage 사용과 "원티드와 관련 없는 실습 사이트"를 밝혀요. 원티드 로고·이름을 서비스 이름처럼 쓰지 않아요.

## 함께 일할 때

- **내 폴더만 고쳐요.** 공통 파일이나 다른 사람 폴더를 바꿔야 하면 담당자에게 말해요.
- 각자 `feat/<폴더>` 브랜치(예: `feat/studies`)에서 작업하고 `main`으로 PR을 올려요. `main`에 바로 push하지 않아요.
- PR 설명에 바꾼 파일 목록과 `npm test` 결과, 확인한 화면 폭(1440px·375px)을 적어요.
- AI가 틀린 것을 찾으면 이 파일이나 해당 스킬에 규칙을 한 줄 더해요. 찾은 사람이 아니라 **실수가 생긴 단계**의 규칙에 넣어요.
