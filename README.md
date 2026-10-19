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

## 사용한 스킬과 프롬프트

- `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max`, MIT): 빈 상태·로딩·칩·터치 크기 점검
  - `search.py "study group matching community students" --design-system`
  - `search.py "touch target size chip" --domain ux`, `"filter chips toggle state"`, `"loading skeleton empty state"`
- 프롬프트: "첨부한 스터디 매칭보드 기획안과 matching_test_members.csv를 기준으로, 원티드 Montage 토큰을 써서 화면 4개(R1~R8)를 순수 HTML로 만들고, 7장 규칙은 테스트로 확인해 줘."

## 사용한 오픈소스

- [Montage](https://github.com/wanteddev/montage-web) 디자인 토큰 — MIT
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — MIT
- [Pretendard](https://github.com/orioncactus/pretendard) — OFL

원티드와 관련 없는 실습 프로젝트예요.
