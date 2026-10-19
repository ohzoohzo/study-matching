# 스터디 매칭보드 — 공통 규칙

기획안: `스터디_매칭보드_기획안.pdf` (@우현, 2026-10-19). 이 파일과 부딪히면 **기획안의 필수 요구사항(R1~R8)과 7장 규칙이 이겨요.**

## 무엇을 만드나

기수원 40명이 관심 도메인을 기준으로 개발·디자인·PO·마케터가 섞인 팀을 꾸리게 돕는 매칭보드예요.
핵심은 "이 팀은 어떤 역할이 비어 있는지"가 카드만 보고 한눈에 보이는 것이에요. 이번에는 배포보다 **실험**이 목적이에요.

## 파일

```
study-matching/
├── index.html       화면 4개 (매칭보드 #/ · 프로필 등록 #/profile · 팀 상세 #/team/t1 · 운영진 관리 #/admin)
├── app.js           화면 그리기와 저장 (localStorage)
├── logic.js         기획안 7장 규칙: 정원 계산·추천 점수·지원/수락·자동 배치 (화면과 테스트가 같이 써요)
├── style.css        공통 스타일 (원티드 Montage 토큰 + Pretendard)
├── data/
│   ├── matching_test_members.csv   기획안 테스트 데이터 40명 (그대로)
│   └── teams.json                  6팀 (기획안 JSON이 없어서 만든 가정 데이터, _note 참고)
├── test/logic.test.js   npm test: R1~R8과 평가 체크리스트를 숫자로 확인
└── .claude/skills/ui-ux-pro-max/   UI/UX 점검 스킬
```

## 규칙 (고칠 때 꼭 지켜요)

- **규칙 계산은 `logic.js`에만** 있어요. 화면(`app.js`)에서 점수나 정원을 따로 계산하지 않아요.
- 추천에 **AI 호출을 쓰지 않아요.** 숫자 계산만으로 같은 입력에 같은 결과가 나와야 해요.
- 데이터 필드 이름은 기획안과 같아요: member(id, name, role, domains, times, intro), team(id, number, domain, mainTimes, slots, leaderId), application(id, memberId, teamId, role, status).
- role은 `dev/design/po/marketing`, status는 `pending/accepted/rejected`, 도메인 5개와 시간대 6개는 `logic.js`의 목록에서만 골라요(자유 입력 없음).
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
