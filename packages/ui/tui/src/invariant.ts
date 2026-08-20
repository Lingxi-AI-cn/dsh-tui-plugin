/** Package-owned invariant companion for `@lingxi-ai-cn/dsh-tui-runtime`. */

import type { Context, InvariantInstaller } from './host.ts'

const PACKAGE_NAME = '@lingxi-ai-cn/dsh-tui-runtime'
export const name = 'tui-invariant'
export const inject = ['invariants']

// No runtime invariant: the TUI owns no cross-plugin mutable registry. Its Agent handle, listeners,
// question provider, Ink root, and terminal transaction are one effect whose
// assembled lifecycle is covered by package and PTY tests.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
