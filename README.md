# 스터디 매칭

함께 공부할 사람을 찾는 스터디 매칭 사이트예요. 모집글을 보고, 신청하고, 모집자가 수락하면 매칭돼요.

- 화면: HTML·CSS·JavaScript + 원티드 디자인 시스템 [Montage](https://montage.wanted.co.kr) 토큰(MIT) + Pretendard
- 서버: Vercel 서버 함수 (`api/`)
- 데이터: 지금은 `data/seed.json`(가상 데이터, 읽기 전용) → 나중에 Vercel Storage(Redis 또는 Postgres)
- 배포: Vercel

## 시작하기

```bash
npm i -g vercel        # 처음 한 번
vercel link            # 처음 한 번, Vercel 프로젝트와 연결
npm run dev            # http://localhost:3000
npm test               # API 규칙 검사
```

파일을 더블클릭해서 열면 API가 동작하지 않아요. `npm run dev`로 열어 주세요.

## 규칙

공통 규칙은 [CLAUDE.md](CLAUDE.md)에 있어요. 새 페이지는 [`_틀.html`](_틀.html)을 복사해서 시작해요.

## 사용한 오픈소스

- [Montage](https://github.com/wanteddev/montage-web) 디자인 토큰 — MIT
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (`.claude/skills/ui-ux-pro-max`) — MIT
- [Pretendard](https://github.com/orioncactus/pretendard) — OFL

원티드와 관련 없는 실습 프로젝트예요.
