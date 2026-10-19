# 스터디 매칭보드 — 공통 규칙

기획안: `스터디_매칭보드_기획안.pdf` (@우현, 2026-10-19). 이 파일과 부딪히면 **기획안의 필수 요구사항(R1~R8)과 7장 규칙이 이겨요.**

## 무엇을 만드나

기수원 40명이 관심 도메인을 기준으로 개발·디자인·PO·마케터가 섞인 팀을 꾸리게 돕는 매칭보드예요.
핵심은 "이 팀은 어떤 역할이 비어 있는지"가 카드만 보고 한눈에 보이는 것이에요. 이번에는 배포보다 **실험**이 목적이에요.

## 파일

```
study-matching/
├── index.html       메인(/): 스터디 모집 화면. 코드는 recruit/에 있어요
├── recruit/         recruit.js(화면·서버 부르기), recruit-logic.js(모집 규칙, 서버도 같이 써요)
├── api/             Vercel 서버 함수 /api/recruit/* (구글 토큰 검증, Upstash Redis 저장), 공통 코드는 api/_lib/
├── privacy.html     개인정보처리방침
├── style.css        공통 스타일 (원티드 Montage 토큰 + Pretendard)
├── v1/              기획안 버전 백업 (/v1/)
│   ├── index.html   화면 4개 (매칭보드 #/ · 프로필 등록 #/profile · 팀 상세 #/team/t1 · 운영진 관리 #/admin)
│   ├── app.js       화면 그리기와 저장 (localStorage)
│   ├── logic.js     기획안 7장 규칙: 정원 계산·추천 점수·지원/수락·자동 배치 (화면과 테스트가 같이 써요)
│   └── data/
│       ├── matching_test_members.csv   기획안 테스트 데이터 40명 (그대로)
│       └── teams.json                  6팀 (기획안 JSON이 없어서 만든 가정 데이터, _note 참고)
├── test/            npm test: logic.test.js(기획안 R1~R8), recruit*.test.js(모집 규칙·서버 함수)
└── .claude/skills/ui-ux-pro-max/   UI/UX 점검 스킬
```

## 규칙 (고칠 때 꼭 지켜요)

- **규칙 계산은 `v1/logic.js`(기획안)·`recruit/recruit-logic.js`(모집)에만** 있어요. 화면(`v1/app.js`, `recruit/recruit.js`)에서 점수나 정원을 따로 계산하지 않아요.
- 추천에 **AI 호출을 쓰지 않아요.** 숫자 계산만으로 같은 입력에 같은 결과가 나와야 해요.
- 데이터 필드 이름은 기획안과 같아요: member(id, name, role, domains, times, intro), team(id, number, domain, mainTimes, slots, leaderId), application(id, memberId, teamId, role, status).
- role은 `dev/design/po/marketing`, status는 `pending/accepted/rejected`, 도메인 5개와 시간대 6개는 `v1/logic.js`의 목록에서만 골라요(자유 입력 없음).
- 모집 버전(`recruit/`)의 스터디 `times`(진행 시간대)와 신청 `times`(가능한 시간대)는 선택 칸이고, `recruit-logic.js`의 `TIMES`(v1과 같은 6개, 테스트로 확인)에서 고른 요일에 맞는 것만 골라요.
- 모집 버전의 스터디 일정 `deadline`(모집 마감일)·`startDate`·`endDate`는 선택이고 `"2026-10-25"` 모양의 한국 날짜예요. 날짜가 걸린 규칙(`isOpen`·`studyStatus`·`canApply` 등)은 `today`를 인자로 받아서 테스트에서 날짜를 정해 둘 수 있어요.
- 모집 버전(`recruit/`)의 신청 status에는 신청자가 대기 중에 취소한 `withdrawn`이 더 있어요. 스터디는 `closed`(마감, 다시 열 수 있음)와 `canceled`(모집 취소, 되돌릴 수 없음)로 상태를 나타내고, 둘 다 지우지 않고 남겨요.
- 규칙을 바꾸면 `test/logic.test.js`에 테스트를 더하고 `npm test`가 통과해야 PR을 올려요. 특히 아래는 늘 통과해야 해요.
  - 팀 수 6이면 정원표가 기획안 7장 예시와 같다
  - 같은 사람의 추천 상위 3개가 7장 점수대로 나온다
  - 수락 후 다른 팀 지원이 막힌다
  - 확정 후 개발자가 한 팀에 4명 이상 몰리지 않는다

## 디자인

- **원티드 디자인 시스템 Montage**의 토큰만 써요. 색·글자·간격·모서리·그림자는 `var(--semantic-…)`, `var(--typography-…)`, `var(--spacing-…)`, `var(--radius-…)` 또는 `style.css`의 별칭(`--fg`, `--brand`, `--line` …)으로만 써요. `#fff` 같은 색을 직접 쓰지 않아요.
- 글꼴은 Pretendard예요. **이모지는 쓰지 않고**, 아이콘은 Material Icons SVG를 넣어요.
- 데이터를 쓰는 화면은 불러오는 중 · 오류 · 빈 상태를 모두 만들어요. 빈 상태에는 할 수 있는 행동을 함께 둬요.
- 375px에서 가로 스크롤이 없어야 하고, 키보드로 모든 버튼을 쓸 수 있어야 해요. 다크 모드는 Montage 토큰으로 자동 적용돼요.

### UI/UX 점검 스킬 (ui-ux-pro-max)

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "form inline validation error" --domain ux
```

- 스킬이 추천하는 색·글꼴은 쓰지 않아요(Montage가 이겨요). 접근성·상태·폼·반응형 같은 UX 규칙만 가져와요.
- 스킬 문서의 `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...` 경로는 이 레포에서는 `.claude/skills/...`로 바꿔 실행해요.

## 내용

- 이름은 테스트용 가명이에요. 실제 연락처·이메일은 넣지 않아요.
- 해요체로 쓰고, 과장하지 않아요. 푸터에 Montage 사용과 "원티드와 관련 없는 실습 사이트"를 밝혀요.

## 함께 일할 때

- `feat/<기능>` 브랜치에서 작업하고 `main`으로 PR을 올려요. `main`에 바로 push하지 않아요.
- PR 설명에 바꾼 파일, `npm test` 결과, 확인한 화면 폭(1440px·375px), **사용한 스킬 이름과 프롬프트**를 적어요(기획안 평가 항목이에요).
