/** Package-owned invariant companion for the Plugin Hub Service Definition. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@lingxi-ai-cn/dsh-plugin-hub'
export const name = 'plugin-hub-invariant'
export const inject = ['invariants']

/** No runtime invariant: provider registrations are private and effects own their disposal. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
