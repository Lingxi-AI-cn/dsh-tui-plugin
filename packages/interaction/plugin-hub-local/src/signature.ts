/** Ed25519 and canonical JSON helpers for Registry-signed values. */

import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { PluginHubError } from '@lingxi-ai-cn/dsh-plugin-hub'

/**
 * Verify an Ed25519 signature over canonical JSON.
 * @param value - exact signed value.
 * @param signature - unpadded base64url signature.
 * @param publicKey - PEM or raw base64url Ed25519 public key.
 * @param label - public diagnostic subject.
 */
export function verifyCanonicalSignature(
  value: unknown,
  signature: string,
  publicKey: string,
  label: string,
): void {
  let keyObject: ReturnType<typeof createPublicKey>
  try {
    keyObject = createPublicKey(publicKey)
  } catch {
    try {
      const raw = Buffer.from(signatureSafeBase64(publicKey), 'base64')
      if (raw.byteLength !== 32) throw new Error('invalid raw Ed25519 key length')
      keyObject = createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
        format: 'der',
        type: 'spki',
      })
    } catch (error: unknown) {
      throw new PluginHubError(`${label} signing key is invalid.`, 'SIGNATURE_INVALID', { cause: error })
    }
  }
  let valid = false
  try {
    const bytes = Buffer.from(signatureSafeBase64(signature), 'base64')
    valid = verifySignature(null, Buffer.from(canonicalJson(value)), keyObject, bytes)
  } catch (error: unknown) {
    throw new PluginHubError(`${label} signature could not be verified.`, 'SIGNATURE_INVALID', { cause: error })
  }
  if (!valid) throw new PluginHubError(`${label} signature is invalid.`, 'SIGNATURE_INVALID')
}

/**
 * Serialize the Registry's JSON-only signed values with sorted object keys.
 * @param value - parsed JSON value.
 * @returns canonical UTF-8 source used by the Registry signatures.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}

function signatureSafeBase64(value: string): string {
  if (!/^[A-Za-z0-9+/_=-]+$/u.test(value)) throw new Error('invalid base64')
  return value.replaceAll('-', '+').replaceAll('_', '/')
}
