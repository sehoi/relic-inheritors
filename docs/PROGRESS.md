# 진행 저널

자율 루프가 이터레이션마다 **최상단에** 한 항목씩 추가한다.
위에서부터 읽으면 최근 진행 상황이 파악된다.

형식:

```md
### YYYY-MM-DD · T-0NN · <제목>
- 한 일:
- 알게 된 것:
- 다음에 걸릴 것 같은 것:
```

---

### 2026-08-04 · T-001~T-006 · M0 부트스트랩
- 한 일: Vite + TS(strict) + Phaser 3 프로젝트 구성, `npm run verify` 파이프라인, 결정론적 RNG(mulberry32) + 12 테스트, Playwright 스모크, GitHub Actions CI, Boot→Title→Overworld 씬 골격
- 알게 된 것:
  - ADR-001/002를 문서로만 두지 않고 **ESLint 규칙으로 강제**했다. `src/core/**`의 phaser·window·document import 금지, 전 소스의 `Math.random()` 금지. 자율 루프는 문서를 어길 수 있지만 린트는 못 어긴다.
  - 씬 전환 검증을 스크린샷 픽셀 비교가 아니라 `body[data-scene]` 속성 질의로 했다 (`src/game/sceneMarker.ts`). 취약하지 않고 루프가 읽기 쉽다. **씬을 추가하면 반드시 `markScene()`을 호출해야 한다.**
  - npm 11이 install script를 기본 차단해서 esbuild postinstall 경고가 뜨지만, 플랫폼별 optional dependency로 바이너리가 들어와 빌드에는 지장이 없었다.
- 다음에 걸릴 것 같은 것:
  - 번들이 1.48MB(gzip 341KB)다. Phaser 전체를 싣고 있어서인데, 지금은 문제가 아니지만 M6 폴리시에서 커스텀 빌드나 코드 스플리팅을 검토해야 한다.
  - `npm run sim`은 아직 없다 (M3에서 생성). CLAUDE.md의 명령어 표에 (M3) 표시를 달아뒀다.
  - T-007a 에셋 색인이 다음 차례다. 에셋 팩이 아직 없으므로 빈 색인 + 플레이스홀더 규칙만 세우고 넘어간다.

### 2026-08-04 · T-000 · 설계 및 저장소 초기화
- 한 일: 아키텍처/기획서/백로그/자동화 설계 문서 작성, Node.js 24 · GitHub CLI 설치, 저장소 초기화
- 알게 된 것: 백지 환경이라 스택 제약이 없었음. 자율 검증 가능성을 최우선 기준으로 TypeScript + Phaser 3 + Vite 선택
- 다음에 걸릴 것 같은 것: M0(T-001~T-006)로 검증 파이프라인을 세우기 전까지는 루프를 켜지 않는다
