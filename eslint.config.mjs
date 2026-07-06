// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      // Prohibido `any` salvo excepción justificada y comentada (nestjs-conventions)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-member-accessibility': 'off',
    },
  },
  {
    // Regla de dependencia de Clean Architecture, verificada por lint (no solo convención):
    // el dominio no importa NestJS, Prisma, ni capas externas.
    files: ['src/modules/*/domain/**/*.ts', 'src/shared/domain/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '@nestjs/*', '**/infrastructure/**', '**/interface/**'],
              message:
                'La capa domain debe permanecer pura: sin NestJS, Prisma ni imports de infrastructure/interface (ver docs/design/02-arquitectura.md).',
            },
          ],
        },
      ],
    },
  },
);
