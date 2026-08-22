import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../../../vitest.shared.ts'

/** Opt-in deterministic benchmark for native TUI long-session work. */
export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.base.json'] }),
    standardDecoratorPlugin(),
  ],
  test: {
    include: ['packages/ui/tui/tests/**/*.perf.tsx'],
    pool: 'forks',
    execArgv: [...vitestExecArgv, '--expose-gc'],
    disableConsoleIntercept: true,
    testTimeout: 180_000,
  },
})
