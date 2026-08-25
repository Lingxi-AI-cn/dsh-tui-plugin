import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'

import { payloadDigest } from './release-payload.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('digests a package entry larger than the child-process default buffer', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-tui-release-payload-'))
  temporaryDirectories.push(temporary)
  const packageDirectory = join(temporary, 'package')
  mkdirSync(packageDirectory)
  writeFileSync(join(packageDirectory, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n')
  writeFileSync(join(packageDirectory, 'large.js'), Buffer.alloc(2 * 1024 * 1024, 0x61))
  const tarball = join(temporary, 'fixture.tgz')
  execFileSync('tar', ['-czf', tarball, 'package'], { cwd: temporary })

  assert.match(payloadDigest(tarball), /^[0-9a-f]{128}$/u)
})
