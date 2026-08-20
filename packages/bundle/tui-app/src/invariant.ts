/** Package-owned invariant companion for `@lingxi-ai-cn/dsh-tui`. */

import type { Context, InvariantInstaller } from './host.ts'

const PACKAGE_NAME = '@lingxi-ai-cn/dsh-tui'
export const name = 'tui-app-invariant'
export const inject = ['invariants']
// No runtime invariant: this package contributes only a patch layer and one static prompt section.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
