import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    // 유닛 테스트는 core 로직만 대상으로 한다. 브라우저 스모크는 Playwright 담당.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
