# 계승자 (Relic Inheritors) — 가제

각인술 문명이 무너진 세계. 사람은 더 이상 스스로 마법을 쓰지 못하고,
힘은 오직 유적에 남은 **유물(Relic)** 을 통해서만 빌릴 수 있다.

2D 턴제 JRPG. **TypeScript + Phaser 3 + Vite.**
자율 AI 루프가 개발하며, 사람은 방향 설정과 확인만 한다.

능력은 캐릭터가 아니라 유물에 귀속된다. 파티 8개 슬롯에 어떤 유물을 배분하느냐가 곧 빌드이고,
태그 조합이 맞으면 **공명**이 발동하며, 강한 유물을 쓸수록 **침식**이 쌓인다.
자세한 내용은 [docs/GDD.md](docs/GDD.md) 참조.

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:5173
```

## 개발 명령

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 (HMR) |
| `npm run verify` | typecheck + lint + test + build — **커밋 전 필수** |
| `npm run test` | Vitest (core 유닛 테스트) |
| `npm run smoke` | Playwright 부팅 스모크 + 스크린샷 |
| `npm run sim` | 헤드리스 전투 시뮬레이터 (밸런스 확인) |
| `npm run build` | 프로덕션 빌드 |

## 문서

| 파일 | 내용 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 구조, 경계, 테스트 전략 |
| [docs/GDD.md](docs/GDD.md) | 게임 기획서 · 마일스톤 |
| [docs/BACKLOG.md](docs/BACKLOG.md) | 작업 큐 |
| [docs/AUTOMATION.md](docs/AUTOMATION.md) | 자율 개발 루프와 가드레일 |
| [docs/PROGRESS.md](docs/PROGRESS.md) | 이터레이션 저널 — **밤새 뭘 했는지는 여기부터** |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 아키텍처 결정 기록 |

## 자율 루프

```
/loop /next-task
```

1 이터레이션 = 백로그 태스크 1개 = PR 1개.
`npm run verify`가 초록이 아니면 커밋하지 않고, CI가 초록이 아니면 머지하지 않는다.
자세한 절차와 정지 조건은 [docs/AUTOMATION.md](docs/AUTOMATION.md) 참조.

## 현재 상태

**M0 (부트스트랩) 진행 전.** 설계 문서와 자동화 골격만 존재한다.
`docs/BACKLOG.md`의 T-001부터 시작한다.
