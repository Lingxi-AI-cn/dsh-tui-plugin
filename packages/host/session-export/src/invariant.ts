/** Package-owned invariant companion for host Session export. @module @lingxi-ai-cn/dsh-session-export/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@lingxi-ai-cn/dsh-session-export'

/** Cordis companion plugin name. */
export const name = 'host-session-export-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: export observes owning persistence, lineage, attachment,
 * and Session flush APIs and emits no durable or live events of its own.
 */
const install: InvariantInstaller = () => {}

/**
 * Register the package invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
