import { defineConfig } from 'tsdown'

const common = {
  outDir: 'lib',
  format: ['esm'] as const,
  platform: 'node' as const,
  target: 'es2024' as const,
  fixedExtension: false,
  outputOptions: { codeSplitting: false },
  dts: false,
  clean: false,
}

export default defineConfig([
  { ...common, entry: ['lib/types/index.js'] },
  { ...common, entry: ['lib/types/invariant.js'] },
  { ...common, entry: ['lib/types/maintenance-bin.js'] },
])
