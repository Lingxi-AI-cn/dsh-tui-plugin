import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@lingxi-ai-cn/dsh-profile-plugin-manager': fileURLToPath(new URL('./packages/boot/profile-plugin-manager/src/index.ts', import.meta.url)),
      '@lingxi-ai-cn/dsh-plugin-hub': fileURLToPath(new URL('./packages/interaction/plugin-hub/src/index.ts', import.meta.url)),
      '@lingxi-ai-cn/dsh-plugin-hub-local': fileURLToPath(new URL('./packages/interaction/plugin-hub-local/src/index.ts', import.meta.url)),
      '@lingxi-ai-cn/dsh-session-export': fileURLToPath(new URL('./packages/host/session-export/src/index.ts', import.meta.url)),
      '@lingxi-ai-cn/dsh-tui-runtime': fileURLToPath(new URL('./packages/ui/tui/src/index.ts', import.meta.url)),
      '@lingxi-ai-cn/dsh-tui': fileURLToPath(new URL('./packages/bundle/tui-app/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/*/tests/**/*.spec.{ts,tsx}'],
    exclude: ['packages/ui/tui/tests/long-session.perf.tsx'],
    pool: 'forks',
  },
})
