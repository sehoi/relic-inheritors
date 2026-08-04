# 아키텍처 설계

## 1. 설계 원칙

이 프로젝트는 **사람의 개입 없이 AI 루프가 계속 개발할 수 있는 것**을 최우선 제약으로 둔다.
따라서 일반적인 게임 프로젝트와 다른 선택을 몇 가지 한다.

| 원칙 | 이유 |
|---|---|
| **로직과 렌더링을 물리적으로 분리** | 게임 로직이 Phaser에 묶여 있으면 헤드리스 테스트가 불가능하다. 자율 루프는 "초록불/빨간불" 신호가 없으면 아무것도 검증할 수 없다. |
| **결정론적 RNG (시드 주입)** | 전투 결과를 재현할 수 있어야 회귀 테스트가 성립한다. `Math.random()` 직접 호출은 금지. |
| **콘텐츠는 데이터로** | 몬스터/아이템/스킬/대사를 코드가 아닌 데이터 파일로 두면, 루프가 코드 변경 없이 콘텐츠만 안전하게 늘릴 수 있다. |
| **스키마 검증** | 데이터 파일이 늘어날수록 오타 하나로 런타임에 죽는다. Zod로 빌드 타임에 잡는다. |
| **얇은 씬(Scene)** | Phaser 씬에는 "그리기와 입력"만. 판단은 전부 core로 위임. |

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript (strict) | |
| 엔진 | Phaser 3 | 타일맵 · 스프라이트 · 트윈 · 입력 내장 |
| 번들러 | Vite | `npm run dev` 즉시 실행, HMR |
| 테스트 | Vitest | core 로직 유닛 테스트 |
| 스모크 | Playwright (chromium) | 실제 부팅 + 콘솔 에러 0 + 스크린샷 |
| 검증 | Zod | 데이터 파일 스키마 |
| 린트/포맷 | ESLint + Prettier | |
| 맵 편집 | Tiled (`.tmj` JSON) | 사람이 손댈 때만 사용, 루프는 JSON 직접 생성 가능 |
| CI | GitHub Actions | |

> 브라우저에서 돌기 때문에 로컬 확인은 `npm run dev` → `http://localhost:5173` 이면 끝이고,
> AI 루프도 같은 URL을 내장 브라우저로 열어 **스스로 화면과 콘솔을 확인**할 수 있다. 이게 이 스택을 고른 결정적 이유다.

## 3. 디렉터리 구조

```
jrpg/
├─ CLAUDE.md                # 루프가 매 이터레이션 읽는 규칙/가드레일
├─ docs/
│  ├─ ARCHITECTURE.md       # (이 문서)
│  ├─ GDD.md                # 게임 기획서 = 백로그 생성의 근거
│  ├─ BACKLOG.md            # 작업 큐 (루프의 입력)
│  ├─ PROGRESS.md           # 이터레이션 저널 (루프의 출력)
│  ├─ DECISIONS.md          # 아키텍처 결정 기록 (ADR)
│  └─ screenshots/          # 이터레이션별 스모크 스크린샷
├─ .claude/
│  ├─ commands/next-task.md # 이터레이션 1회의 절차 정의
│  ├─ settings.json         # 권한 허용목록 (프롬프트 최소화)
│  └─ launch.json           # dev 서버 정의 (내장 브라우저 연동)
├─ .github/workflows/ci.yml
├─ src/
│  ├─ core/                 # ★ Phaser 의존성 0. 순수 TS. 테스트 대상.
│  │  ├─ rng/               # 시드 기반 결정론적 난수 (mulberry32)
│  │  ├─ stats/             # 스탯 계산, 버프/디버프 합성
│  │  ├─ battle/            # 턴 큐, 행동 해석, 데미지 공식, 상태이상, AI
│  │  ├─ relic/             # ★ 유물: 장착 슬롯, 공명 판정, 숙련도, 침식
│  │  ├─ party/             # 파티 구성, 액터 상태
│  │  ├─ inventory/         # 소지품, 사용 효과
│  │  ├─ progression/       # 경험치 곡선, 레벨업, 스킬 습득
│  │  ├─ world/             # 맵 그래프, 이동 판정, 인카운터 테이블
│  │  ├─ quest/             # 플래그, 퀘스트 상태 머신
│  │  └─ save/              # 직렬화 + 스키마 버전 마이그레이션
│  ├─ data/                 # 콘텐츠 (전부 Zod 스키마 검증)
│  │  ├─ schema.ts
│  │  ├─ relics.ts  resonances.ts   # ★ 루프가 가장 자주 늘리는 파일
│  │  ├─ actors.ts  skills.ts  items.ts  enemies.ts
│  │  ├─ maps/*.tmj
│  │  └─ dialogue/*.json
│  ├─ game/                 # ☆ Phaser 레이어. 얇게 유지.
│  │  ├─ scenes/            # Boot Title Overworld Battle Menu GameOver
│  │  ├─ ui/                # 창, 커서, 텍스트박스, HP바
│  │  └─ adapters/          # core 상태 ↔ Phaser 표현 브릿지
│  └─ main.ts
├─ assets/                  # CC0 에셋. index.json에 등재된 것만 사용 가능
│  ├─ index.json            # 에셋 색인 (경로 · 용도 · 출처 · 라이선스)
│  └─ CREDITS.md            # 출처 표기 (누락 시 CI 실패)
├─ tools/
│  └─ sim.ts                # 밸런스 시뮬레이터 CLI (헤드리스 전투 N회)
└─ tests/
   ├─ unit/                 # core 대상
   ├─ balance/              # 시뮬 기반 밸런스 회귀 (GDD §5.5 불변식)
   └─ smoke/                # Playwright 부팅 검증
```

**의존 방향은 단방향이다: `game → core`, `game → data`, `core → (아무것도 아님)`.**
`src/core/**` 안에서 `phaser`를 import 하면 ESLint 규칙으로 CI에서 실패시킨다. 이 경계가 무너지면 자율 검증이 통째로 무너지기 때문에 기계적으로 강제한다.

## 4. 핵심 시스템 설계

### 4.1 결정론적 RNG

```ts
// core/rng — 모든 무작위성의 단일 출처
export interface Rng { next(): number; int(min: number, max: number): number; }
export function createRng(seed: number): Rng
```

전투 시작 시 시드를 주입받고, 전투 로그에 시드를 기록한다.
→ 버그 리포트가 "시드 4821에서 3턴째 크래시"가 되고, 그대로 회귀 테스트가 된다.

### 4.2 전투 (가장 복잡하고, 가장 테스트하기 좋은 부분)

전투는 **순수 함수 상태 머신**으로 만든다. 렌더링은 이 상태 머신이 뱉는 이벤트 로그를 재생할 뿐이다.

```ts
type BattleState = { turn: number; queue: ActorId[]; actors: Record<ActorId, ActorState>; rng: RngState }
type Command = { type: 'attack'|'skill'|'item'|'guard'|'flee'; actor: ActorId; target?: ActorId; id?: string }
type BattleEvent = { type: 'damage'|'heal'|'status'|'death'|'message'|'turnEnd'; ... }

function step(state: BattleState, cmd: Command): { state: BattleState; events: BattleEvent[] }
```

이 구조의 이득:
- 전투 전체를 브라우저 없이 1초에 수천 번 돌릴 수 있다 → 밸런스 자동 검증
- 이벤트 로그가 곧 애니메이션 스크립트가 된다 → 연출과 로직이 자동 동기화
- 리플레이/되감기/AI 학습이 공짜로 따라온다

데미지 공식은 처음부터 `data`에 파라미터로 빼둔다 (하드코딩된 상수 금지).

### 4.3 세이브

`save/` 는 버전 번호를 갖고, 마이그레이션 함수 체인을 통과한다.
루프가 스키마를 바꿀 때마다 마이그레이션 + 그에 대한 테스트를 같이 쓰도록 CLAUDE.md에 못 박는다.
(자율 개발에서 가장 조용히 망가지는 지점이 세이브 호환성이다.)

## 5. 테스트 전략 — "자율 루프의 눈"

| 계층 | 도구 | 무엇을 잡나 | 실행 시간 |
|---|---|---|---|
| 유닛 | Vitest | 데미지 공식, 레벨업, 인벤토리, 세이브 마이그레이션 | ~1s |
| 데이터 | Zod + Vitest | 존재하지 않는 스킬 ID 참조, 맵 연결 끊김 | ~1s |
| 밸런스 | `tools/sim.ts` | 유물 조합별 승률·침식 곡선 → GDD §5.5 불변식 위반 (지배 전략 발생, 사장된 유물, 전투 길이 이탈) | ~5s |
| 스모크 | Playwright | 부팅 실패, 에셋 404, 콘솔 에러, 씬 전환 크래시 | ~15s |
| 시각 | 스크린샷 아카이브 | 사람이 나중에 훑어볼 근거 | — |

`npm run verify` = `typecheck && lint && test && build`.
**이 명령이 초록불이 아니면 루프는 절대 커밋하지 않는다.** 이게 전체 자동화의 유일한 안전장치다.

## 6. CI

`.github/workflows/ci.yml` — PR과 main push에서:
1. `npm ci`
2. `npm run verify`
3. `npx playwright test` (스모크)
4. 스크린샷 아티팩트 업로드

PR 필수 체크로 걸어두면, 루프의 자동 머지는 CI가 초록일 때만 성립한다.
