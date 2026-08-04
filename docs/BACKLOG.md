# 백로그

루프의 입력. **최상단 미완료 태스크부터** 하나씩 처리한다.
규칙은 `docs/AUTOMATION.md` §2, §4 참조.

표기:
- `- [ ]` 미완료 / `- [x]` 완료 / `- [!]` BLOCKED (사유를 하위 줄에 기록)

---

## M0 — 부트스트랩

- [ ] **T-001** Vite + TypeScript(strict) + Phaser 3 프로젝트 초기화
  - DoD: `npm run dev`로 검은 화면 + "Hello" 텍스트가 뜬다
- [ ] **T-002** 품질 파이프라인 구성
  - DoD: `npm run verify` = `typecheck && lint && test && build`가 초록. ESLint에 `src/core/**`의 `phaser` import 금지 규칙 포함
- [ ] **T-003** Vitest 셋업 + `core/rng` 결정론적 RNG 구현
  - DoD: 같은 시드 → 같은 수열임을 검증하는 테스트 통과
- [ ] **T-004** Playwright 스모크 테스트
  - DoD: 부팅 시 콘솔 에러 0을 검증하고 스크린샷을 `docs/screenshots/`에 남긴다
- [ ] **T-005** GitHub Actions CI
  - DoD: PR에서 verify + 스모크가 돌고, 스크린샷이 아티팩트로 올라간다
- [ ] **T-006** 씬 골격 (Boot → Title → Overworld) + 씬 전환
  - DoD: 타이틀에서 Enter로 오버월드 진입, 스모크가 두 씬 모두 통과

## M1 — 탐색

- [ ] **T-007a** 에셋 색인 체계 구축
  - DoD: `assets/index.json` 스키마 정의, `assets/CREDITS.md` 생성, 색인에 없는 에셋 경로를 참조하면 실패하는 검증 테스트 추가 (GDD §7, ADR-006)
  - 에셋 팩이 아직 없으면 빈 색인 + 플레이스홀더 규칙만 세우고 통과시킨다
- [ ] **T-007** 타일맵 로딩 (Tiled `.tmj`) + 렌더링
- [ ] **T-008** 그리드 4방향 이동 + 충돌 판정 (`core/world`에 순수 로직, 테스트 포함)
- [ ] **T-009** 카메라 추적 + 맵 경계 클램프
- [ ] **T-010** 대화 시스템: 텍스트박스, 페이지네이션, NPC 상호작용
- [ ] **T-011** 맵 간 이동 (입구/계단) + 플레이어 위치 복원
- [ ] **T-012** 데이터 스키마(Zod) + 데이터 검증 테스트
  - DoD: `Relic`·`Resonance`·`Skill`·`Item`·`Enemy` 스키마 정의. 존재하지 않는 ID 참조 시 테스트 실패

---

> M2 이후 태스크는 백로그가 3개 미만이 되면 `docs/GDD.md`를 근거로 루프가 생성한다.
> M3(유물 시스템)에는 반드시 다음이 포함되어야 한다:
> - `tools/sim.ts` 밸런스 시뮬레이터
> - GDD §5.5 불변식 5개를 검증하는 `tests/balance/` 테스트
>
> **이 두 개 없이 유물·공명 데이터를 늘리지 않는다.** 검증 없이 조합만 늘리면 밸런스가 조용히 무너지고, 그 시점부터 루프는 자기가 뭘 망가뜨렸는지 알 수 없게 된다.
