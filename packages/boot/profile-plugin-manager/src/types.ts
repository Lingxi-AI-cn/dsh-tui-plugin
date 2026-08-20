/** Public vocabulary for trusted local profile plugin management. */

/** Digest encoding used for a verified local artifact. */
export type ProfilePluginDigestEncoding = 'hex' | 'base64'

/** A digest that the manager can check before invoking pnpm. */
export interface ProfilePluginDigest {
  readonly algorithm: 'sha512'
  readonly encoding: ProfilePluginDigestEncoding
  readonly value: string
}

/** An exact, already verified local artifact selected by a trusted caller. */
export interface ProfilePluginArtifact {
  /** Absolute path to the private artifact file. */
  readonly path: string
  /** Package identity expected after installation. */
  readonly packageName: string
  /** Package version expected after installation. */
  readonly version: string
  /** Optional digest checked immediately before pnpm runs. */
  readonly digest?: ProfilePluginDigest
  /** Artifact byte size recorded by the descriptor verifier. */
  readonly sizeBytes?: number
  /** The bundle patch declared by the verified package, when present. */
  readonly bundlePatch?: string
  /** Lifecycle scripts reported by the descriptor. */
  readonly lifecycleScripts?: readonly string[]
}

/** Hub receipt fields used to distinguish managed and unmanaged packages. */
export interface ProfilePluginReceipt {
  readonly packageName: string
  readonly version: string
  readonly pluginId?: string
  readonly versionId?: string
  readonly sourceCommit?: string
  readonly artifactDigest?: string
}

/** Health of one dependency and its optional bundle layer. */
export type ProfilePluginHealth =
  | 'ok'
  | 'missing-package'
  | 'missing-entry'
  | 'manifest-invalid'
  | 'unknown'

/** Exact lockfile facts associated with one profile dependency. */
export interface ProfilePluginLockEntry {
  readonly specifier?: string
  readonly version?: string
  readonly integrity?: string
  readonly resolution?: string
}

/** Point-in-time installed truth for one third-party profile dependency. */
export interface ProfilePluginInstalled {
  readonly packageName: string
  readonly requested?: string
  readonly version?: string
  readonly resolvedPath?: string
  readonly locked?: ProfilePluginLockEntry
  readonly bundlePatch?: string
  readonly activeBundle: boolean
  readonly managed: boolean
  readonly pluginId?: string
  readonly versionId?: string
  readonly sourceCommit?: string
  readonly artifactDigest?: string
  readonly health: ProfilePluginHealth
}

/** Local lockfile projection used by installed truth and revision checks. */
export interface ProfilePluginLockfile {
  readonly present: boolean
  readonly importer: Readonly<Record<string, ProfilePluginLockEntry>>
  readonly digest?: string
}

/** Installed profile state used as a detached plan baseline. */
export interface ProfilePluginInstalledSnapshot {
  readonly profileDir: string
  readonly revision: string
  readonly dependencies: Readonly<Record<string, string>>
  readonly bundles: readonly string[]
  readonly plugins: readonly ProfilePluginInstalled[]
  readonly lockfile: ProfilePluginLockfile
}

/** Mutation operation represented by a detached plan. */
export type ProfilePluginOperation = 'install' | 'update' | 'remove'

/** Target package and exact artifact for an install or update plan. */
export interface ProfilePluginPlanTarget {
  readonly packageName: string
  readonly version: string
  readonly artifact?: ProfilePluginArtifact
  readonly bundlePatch?: string
  readonly lifecycleScripts: readonly string[]
}

/** A profile mutation plan that contains no live manager or process handles. */
export interface ProfilePluginChangePlan {
  readonly planId: string
  readonly operation: ProfilePluginOperation
  readonly profileRevision: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly packageName: string
  readonly target?: ProfilePluginPlanTarget
  readonly before: ProfilePluginInstalledSnapshot
  readonly afterBundles: readonly string[]
  readonly restartRequired: true
  readonly risks: readonly string[]
}

/** Request used to create one detached profile plan. */
export type ProfilePluginPlanRequest =
  | { readonly operation: 'install' | 'update'; readonly artifact: ProfilePluginArtifact }
  | { readonly operation: 'remove'; readonly packageName: string }

/** Result of one pnpm invocation with bounded diagnostics. */
export interface ProfilePluginPnpmResult {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly stdoutOmittedBytes: number
  readonly stderrOmittedBytes: number
  readonly timedOut: boolean
  readonly aborted: boolean
  readonly warnings: readonly string[]
}

/** Output and cancellation policy for an advanced pnpm passthrough invocation. */
export interface ProfilePluginPnpmOptions {
  /** Directory used to anchor relative filesystem package specifications. */
  readonly invocationCwd?: string
  /** Cancellation for lock waiting and the spawned process tree. */
  readonly signal?: AbortSignal
  /** Whether pnpm output is also written to the current process streams. */
  readonly forwardOutput?: boolean
  /** Whether an advanced passthrough command inherits the current process stdin. */
  readonly inheritStdin?: boolean
  /** Optional observer for each stdout chunk. */
  readonly onStdout?: (chunk: Uint8Array) => void
  /** Optional observer for each stderr chunk. */
  readonly onStderr?: (chunk: Uint8Array) => void
}

/** Result returned after a typed profile mutation succeeds. */
export interface ProfilePluginMutationResult {
  readonly operation: ProfilePluginOperation
  readonly before: ProfilePluginInstalledSnapshot
  readonly after: ProfilePluginInstalledSnapshot
  readonly pnpm: ProfilePluginPnpmResult
  readonly warnings: readonly string[]
}

/** Stable manager error categories for CLI and future Host consumers. */
export type ProfilePluginErrorCode =
  | 'PROFILE_BUSY'
  | 'PROFILE_CHANGED'
  | 'PROFILE_INVALID'
  | 'PLAN_EXPIRED'
  | 'INVALID_ARTIFACT'
  | 'PNPM_UNAVAILABLE'
  | 'PNPM_FAILED'
  | 'BUILD_NOT_ALLOWED'
  | 'OPERATION_ABORTED'
  | 'OPERATION_TIMEOUT'

/** Typed local-management failure with a bounded diagnostic. */
export class ProfilePluginError extends Error {
  /** Stable category for callers that need structured failure handling. */
  readonly code: ProfilePluginErrorCode

  /**
   * @param message - bounded diagnostic for an operator or UI.
   * @param code - stable failure category.
   * @param options - optional underlying cause.
   */
  constructor(message: string, code: ProfilePluginErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProfilePluginError'
    this.code = code
  }
}

/** Process identity resolver used to decide whether a lock owner is stale. */
export type ProfilePluginProcessIdentity = (pid: number) => Promise<string | undefined>

/** Explicit runtime policy for one manager instance. */
export interface ProfilePluginManagerOptions {
  /** Absolute profile directory owned by this manager. */
  readonly profileDir: string
  /** Shared cross-process lock directory for this profile. */
  readonly lockPath: string
  /** Initial bundles used when the profile is first materialized. */
  readonly initialBundles: readonly string[]
  /** Installation package.json used as the first bundle resolution anchor. */
  readonly installAnchor?: string
  /** Fixed executable and prefix argv used to invoke pnpm. */
  readonly pnpmCommand?: readonly string[]
  /** Maximum wall-clock duration for one pnpm process. */
  readonly processTimeoutMs: number
  /** Maximum wait for the shared profile lock. */
  readonly lockTimeoutMs: number
  /** Maximum retained bytes per pnpm output stream. */
  readonly maxOutputBytes: number
  /** Grace period between TERM and KILL during cancellation. */
  readonly terminationGraceMs: number
  /** Detached plan lifetime. */
  readonly planTtlMs: number
  /** Explicit clock for tests and transaction expiry. */
  readonly now?: () => number
  /** Environment passed to pnpm; omission inherits the current environment. */
  readonly env?: NodeJS.ProcessEnv
  /** Process identity implementation for lock tests and platform adapters. */
  readonly processIdentity?: ProfilePluginProcessIdentity
}

/** Options for a lock-protected manager operation. */
export interface ProfilePluginLockOptions {
  readonly signal?: AbortSignal
  readonly transactionId?: string
}

/** Read-only profile validation result. */
export interface ProfilePluginValidation {
  readonly snapshot: ProfilePluginInstalledSnapshot
  readonly valid: boolean
  readonly errors: readonly string[]
}
