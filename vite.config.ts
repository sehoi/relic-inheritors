import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    // 유닛 테스트는 core 로직, balance 는 시뮬레이션 기반 불변식 (GDD §5.5).
    // 브라우저 스모크는 Playwright 담당.
    include: ['tests/unit/**/*.test.ts', 'tests/balance/**/*.test.ts'],
    // 밸런스 테스트는 수백 판을 돌리므로 기본 5초로는 모자라다.
    testTimeout: 30_000,
    environment: 'node',
  },
});
