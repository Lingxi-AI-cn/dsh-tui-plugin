/** Package-owned invariant companion. @module @lingxi-ai-cn/dsh-profile-plugin-manager/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@lingxi-ai-cn/dsh-profile-plugin-manager'

/** Cordis companion plugin name. */
export const name = 'profile-plugin-manager-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: every operation runs outside a mounted Cordis tree. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
