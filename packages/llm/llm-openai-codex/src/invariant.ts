/**
 * Package-owned invariant companion for `@lingxi-ai-cn/dsh-llm-openai-codex`.
 * @module @lingxi-ai-cn/dsh-llm-openai-codex/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@lingxi-ai-cn/dsh-llm-openai-codex'

/** Cordis companion plugin name. */
export const name = 'llm-openai-codex-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: mutable credentials and catalogs are validated at their file and LLM owners. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
