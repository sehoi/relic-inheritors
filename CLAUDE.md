# CLAUDE.md

2D 턴제 JRPG *(가제: 계승자 / Relic Inheritors)*. TypeScript + Phaser 3 + Vite.
능력은 캐릭터가 아니라 **유물(Relic)** 에서 온다. 유물 조합·공명·침식이 게임의 중심이다.

**이 저장소는 자율 루프가 개발한다.** 아래 규칙은 그 전제 위에서 쓰였다.

## 먼저 읽을 것

| 파일 | 역할 |
|---|---|
| `docs/ARCHITECTURE.md` | 구조와 경계. 코드를 짜기 전에 읽는다 |
| `docs/GDD.md` | 무엇을 만들지의 근거 |
| `docs/BACKLOG.md` | 작업 큐 |
| `docs/AUTOMATION.md` | 루프 절차와 가드레일 |
| `docs/PROGRESS.md` | 지금까지의 이터레이션 기록 |

## 명령어

```
npm run dev        # 로컬 실행 → http://localhost:5173
npm run verify     # typecheck + lint + test + build  ← 커밋 전 필수
npm run test       # Vitest (core 유닛 테스트)
npm run smoke      # Playwright 부팅 스모크 + 스크린샷
npm run sim        # 헤드리스 전투 시뮬레이터 (밸런스 확인)
```

## 절대 규칙

1. **`src/core/**` 에서 `phaser`를 import 하지 않는다.** core는 순수 TypeScript다. 이 경계가 헤드리스 테스트를 가능하게 하고, 헤드리스 테스트가 자율 개발을 가능하게 한다. ESLint가 강제한다.
2. **`Math.random()` 직접 호출 금지.** 무작위성은 전부 `core/rng`의 시드 RNG를 통한다. 재현 불가능한 버그는 자율 루프가 절대 못 고친다.
3. **`npm run verify`가 초록이 아니면 커밋하지 않는다.**
4. **`main`에 직접 커밋/푸시하지 않는다.** feature 브랜치 → PR → CI 초록 → squash merge.
5. **`git push --force`, rebase, reset --hard, 히스토리 재작성 금지.**
6. **게임 밸런스 상수를 코드에 하드코딩하지 않는다.** `src/data/`로 뺀다.
7. **세이브 스키마를 바꾸면 마이그레이션 함수와 그 테스트를 같은 PR에 포함한다.**
8. **런타임 의존성을 새로 추가할 때는** PR 본문에 사유를 쓰고, 사용자 확인 없이는 머지하지 않는다.
9. **밸런스 시뮬레이터(`tools/sim.ts`)와 §5.5 불변식 테스트가 존재하기 전에는 유물·공명 데이터를 늘리지 않는다.** 검증 없이 조합만 늘리면 무엇을 망가뜨렸는지 알 수 없게 된다.
10. **`assets/index.json`에 등재되지 않은 에셋을 참조하지 않는다.** 인터넷에서 임의로 내려받지 않는다. 필요한 에셋이 없으면 단색 도형 플레이스홀더를 쓰고 백로그에 "에셋 필요: <용도>"를 추가한 뒤 진행한다.

## 코드 규약

- core 로직은 **테스트를 먼저 쓴다**. 렌더링/UI는 스모크로 대체 가능.
- 순수 함수 우선. 상태 변경은 명시적으로 새 객체를 반환한다.
- 커밋: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `content:`)
- 콘텐츠 추가만 있는 커밋은 `content:` 를 쓴다 (리뷰 부담을 낮추기 위해)
- 주석은 "왜"만. "무엇"은 코드가 말하게 한다.

## 판단이 애매할 때

- **아키텍처 경계를 바꿔야 할 것 같다** → 바꾸지 말고 `docs/DECISIONS.md`에 문제를 적고 루프를 멈춘다.
- **태스크가 너무 크다** → 쪼개서 백로그에 다시 넣고, 첫 조각만 이번 이터레이션에서 한다.
- **2회 연속 verify 실패** → `docs/BACKLOG.md`에 `- [!]`와 사유를 적고 다음 태스크로 넘어간다.
- **고유명사(인물·지명)가 필요하다** → GDD §7에 따라 `TODO_NAME` 플레이스홀더를 쓴다. 임의로 확정하지 않는다.

## 매 이터레이션 끝에

`docs/PROGRESS.md` 최상단에 추가:

```md
### YYYY-MM-DD · T-0NN · <제목>
- 한 일:
- 알게 된 것:
- 다음에 걸릴 것 같은 것:
```
