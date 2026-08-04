# 백로그

루프의 입력. **최상단 미완료 태스크부터** 하나씩 처리한다.
규칙은 `docs/AUTOMATION.md` §2, §4 참조.

표기:
- `- [ ]` 미완료 / `- [x]` 완료 / `- [!]` BLOCKED (사유를 하위 줄에 기록)

---

## M0 — 부트스트랩 ✅

> 사람이 직접 수행. T-001~T-006은 서로 맞물려 있어(빌드 없이는 CI를 못 만들고, 씬 없이는 스모크를 못 짠다) 하나의 PR로 처리했다. T-007a부터는 1태스크 = 1PR.

- [x] **T-001** Vite + TypeScript(strict) + Phaser 3 프로젝트 초기화
- [x] **T-002** 품질 파이프라인 구성 — `npm run verify` 초록. ESLint가 ADR-001(core에 phaser 금지)과 ADR-002(`Math.random()` 금지)를 기계적으로 강제한다
- [x] **T-003** Vitest 셋업 + `core/rng` 결정론적 RNG (mulberry32) — 12 테스트 통과
- [x] **T-004** Playwright 스모크 — 콘솔 에러 0 검증 + `docs/screenshots/` 저장
- [x] **T-005** GitHub Actions CI — verify + 스모크 + 스크린샷 아티팩트
- [x] **T-006** 씬 골격 (Boot → Title → Overworld) + Enter 전환

## M1 — 탐색

- [x] **T-007a** 에셋 색인 체계 구축 — `assets/index.json` 스키마·검증, `CREDITS.md` 대조, 미등재 경로 참조 시 테스트 실패 (ADR-006). 현재 색인은 비어 있음
- [x] **에셋 조달** — Kenney Tiny Town + Tiny Dungeon (CC0-1.0) 벤더 팩으로 등재 완료. `tiles-town`, `tiles-dungeon` 키로 로드 가능
- [x] **T-007b** 실제 타일셋 렌더링 — `tilesets` 파싱, gid → 프레임 매핑, RenderTexture 렌더러. 맵이 Kenney Tiny Dungeon 시트를 쓴다
- [ ] **에셋 필요: 4방향 캐릭터 스프라이트** ⬅ 사람이 처리
  - Tiny Town/Dungeon 에 캐릭터 타일이 있으나 4방향 걷기 프레임은 아니다. T-008 이동은 도형 플레이스홀더로 진행 가능하며, 걷기 애니메이션 단계에서 필요해진다
- [x] **T-007** 타일맵 로딩 (Tiled `.tmj`) + 렌더링 — `core/world/tilemap.ts` 파서·검증, 플레이스홀더 렌더러, `ruin-entrance.tmj` (30x16)
- [x] **T-008** 그리드 4방향 이동 + 충돌 판정 — `core/world/movement.ts`, 막혀도 방향은 바뀜, 스모크가 실제 이동까지 검증
- [x] **T-009** 카메라 추적 + 맵 경계 클램프 — `core/world/camera.ts`, 맵을 60x40(960x640px)으로 확장해 카메라가 실제로 의미를 갖게 함
- [x] **T-010** 대화 시스템 — `core/dialogue` (줄바꿈·쪽 나눔·진행), `core/world/interaction` (마주 본 대상 찾기, NPC 충돌), 텍스트박스 UI, 유적 입구 NPC 3명
- [x] **T-011** 맵 간 이동 (입구/계단) + 플레이어 위치 복원 — `core/world/portal.ts`, 지하 1층 맵 추가, 왕복 검증
- [ ] **에셋 필요: 계단 타일** ⬅ 사람이 처리
  - 포탈이 도형 표식으로 그려진다. Tiny Dungeon 에 계단 타일이 없어 보인다. 없어도 진행에는 지장 없다
- [ ] **T-012** 데이터 스키마(Zod) + 데이터 검증 테스트
  - DoD: `Relic`·`Resonance`·`Skill`·`Item`·`Enemy` 스키마 정의. 존재하지 않는 ID 참조 시 테스트 실패

---

> M2 이후 태스크는 백로그가 3개 미만이 되면 `docs/GDD.md`를 근거로 루프가 생성한다.
> M3(유물 시스템)에는 반드시 다음이 포함되어야 한다:
> - `tools/sim.ts` 밸런스 시뮬레이터
> - GDD §5.5 불변식 5개를 검증하는 `tests/balance/` 테스트
>
> **이 두 개 없이 유물·공명 데이터를 늘리지 않는다.** 검증 없이 조합만 늘리면 밸런스가 조용히 무너지고, 그 시점부터 루프는 자기가 뭘 망가뜨렸는지 알 수 없게 된다.
