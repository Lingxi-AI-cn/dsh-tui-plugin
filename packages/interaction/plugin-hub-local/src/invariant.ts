/** Package-owned invariant companion for the local Plugin Hub provider. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@lingxi-ai-cn/dsh-plugin-hub-local'
export const name = 'plugin-hub-local-invariant'
export const inject = ['invariants']
/** No runtime invariant: provider state is private and registration disposal is owned by ctx.effect. */
const install: InvariantInstaller = () => {}
/** Register the provider invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
