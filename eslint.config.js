import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // assets/ 는 제3자 벤더 팩이 들어오는 곳이다 (ADR-007). 우리 코드가 아니므로 린트하지 않는다.
    // 특히 Tiled 의 타일셋 정의 파일이 `.tsx` 확장자를 쓰는데, 이를 TypeScript JSX 로 파싱하려다 깨진다.
    ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'coverage', 'assets'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // `_` 접두사는 "의도적으로 안 쓴다"는 표시로 인정한다.
      // ignoreRestSiblings 는 구조분해로 특정 키를 덜어내는 관용구를 위해 필요하다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
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
