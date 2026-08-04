import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'coverage'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // ── ADR-001: core 레이어는 순수 TypeScript다 ──────────────────────────────
  // 이 경계가 무너지면 헤드리스 테스트가 불가능해지고, 자율 개발의 검증 수단이 사라진다.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message:
                'core 레이어에 Phaser를 들이지 마세요 (ADR-001). 렌더링은 src/game/ 에서만 합니다.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'core는 브라우저 전역에 의존하지 않습니다 (ADR-001).',
        },
        {
          name: 'document',
          message: 'core는 브라우저 전역에 의존하지 않습니다 (ADR-001).',
        },
        {
          name: 'localStorage',
          message: 'core는 브라우저 전역에 의존하지 않습니다 (ADR-001). 저장소는 어댑터로 주입하세요.',
        },
      ],
    },
  },

  // ── ADR-002: 모든 무작위성은 시드 RNG를 경유한다 ──────────────────────────
  // 재현 불가능한 버그는 자율 루프가 고칠 수 없다.
  {
    files: ['src/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random() 금지 (ADR-002). core/rng 의 createRng(seed) 를 사용하세요.',
        },
      ],
    },
  },
);
