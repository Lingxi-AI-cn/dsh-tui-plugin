import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { SubprocessRuntime, SubprocessSpawnSpec, SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import {
  detectImageMediaType, readTuiClipboard,
  type TuiClipboardEnvironment,
} from '../src/clipboard.ts'

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

interface Response {
  readonly bytes: Uint8Array
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

class FakeSubprocess {
  readonly spawns: SubprocessSpawnSpec[] = []
  readonly terminated = vi.fn()
  private readonly responses = new Map<string, Response>()
  private readonly missing = new Set<string>()
  private readonly delayedResolution = new Set<string>()

  set(argv: readonly string[], text: string | Uint8Array, exitCode = 0): void {
    this.responses.set(this.key(argv), {
      bytes: typeof text === 'string' ? new TextEncoder().encode(text) : text,
      exitCode,
      signal: null,
    })
  }

  unavailable(command: string): void { this.missing.add(command) }

  delayResolve(command: string): void { this.delayedResolution.add(command) }

  runtime(): SubprocessRuntime {
    return {
      resolveExecutable: async (command: string, _env?: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<string> => {
        if (this.missing.has(command)) throw new Error(`missing ${command}`)
        if (this.delayedResolution.has(command)) {
          await new Promise<never>((_, reject) => {
            const abort = (): void => {
              const reason: unknown = signal?.reason as unknown
              reject(reason instanceof Error ? reason : new Error('aborted'))
            }
            if (signal?.aborted === true) abort()
            else signal?.addEventListener('abort', abort, { once: true })
          })
        }
        return `/fake/${command}`
      },
      spawn: (spec: SubprocessSpawnSpec): SubprocessHandle => {
        this.spawns.push(spec)
        const response = this.responses.get(this.key(spec.argv)) ?? {
          bytes: new Uint8Array(), exitCode: 0, signal: null,
        }
        const stdout = Readable.from([response.bytes])
        const handle = {
          stdin: undefined,
          stdout,
          stderr: undefined,
          control: undefined,
          collected: {},
          done: Promise.resolve({ exitCode: response.exitCode, signal: response.signal }),
          terminate: this.terminated,
          waitForExit: async (): Promise<boolean> => true,
        } satisfies SubprocessHandle
        return handle
      },
      spawnTerminal: async (): Promise<never> => { throw new Error('not used') },
    } as unknown as SubprocessRuntime
  }

  private key(argv: readonly string[]): string {
    return argv.map((value, index) => index === 0 ? value.split('/').at(-1) ?? value : value).join('\u0000')
  }
}

function environment(
  platform: TuiClipboardEnvironment['platform'],
  values: Readonly<Record<string, string | undefined>>,
): TuiClipboardEnvironment {
  return { platform, values }
}

describe('typed system clipboard provider', () => {
  it('reads macOS text through pbpaste after empty file and image channels', async () => {
    const fake = new FakeSubprocess()
    fake.set(['pbpaste', '-Prefer', 'public.file-url'], '')
    fake.set(['pbpaste', '-Prefer', 'public.png'], '')
    fake.set(['pbpaste', '-Prefer', 'public.jpeg'], '')
    fake.set(['pbpaste', '-Prefer', 'txt'], 'hello\n')

    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('darwin', {}),
    })).resolves.toEqual({ ok: true, payload: { kind: 'text', text: 'hello\n' }, method: 'pbpaste:text' })
    expect(fake.spawns.map(spec => spec.argv.slice(1))).toEqual([
      ['-Prefer', 'public.file-url'], ['-Prefer', 'public.png'], ['-Prefer', 'public.jpeg'], ['-Prefer', 'txt'],
    ])
  })

  it('reads and validates a macOS image without treating bytes as UTF-8 text', async () => {
    const fake = new FakeSubprocess()
    fake.set(['pbpaste', '-Prefer', 'public.file-url'], '')
    fake.set(['pbpaste', '-Prefer', 'public.png'], PNG)
    expect(detectImageMediaType(PNG)).toBe('image/png')
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('darwin', {}),
    })).resolves.toEqual({
      ok: true,
      payload: { kind: 'image', data: PNG, mediaType: 'image/png', name: 'clipboard.png' },
      method: 'pbpaste:image/png',
    })
  })

  it('expands Wayland targets into a typed file-list command', async () => {
    const fake = new FakeSubprocess()
    fake.set(['wl-paste', '--list-types'], 'text/uri-list\ntext/plain\n')
    fake.set(['wl-paste', '--no-newline', '--type', 'text/uri-list'], 'file:///tmp/example.txt\n')
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('linux', { WAYLAND_DISPLAY: 'wayland-1' }),
    })).resolves.toEqual({
      ok: true,
      payload: { kind: 'files', paths: ['/tmp/example.txt'] },
      method: 'wl-paste:file-list',
    })
  })

  it('expands X11 targets into a validated image command before text fallback', async () => {
    const fake = new FakeSubprocess()
    fake.set(['xclip', '-selection', 'clipboard', '-target', 'TARGETS', '-out'], 'image/png\ntext/plain\n')
    fake.set(['xclip', '-selection', 'clipboard', '-target', 'image/png', '-out'], PNG)
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('linux', { DISPLAY: ':0' }),
    })).resolves.toEqual({
      ok: true,
      payload: { kind: 'image', data: PNG, mediaType: 'image/png', name: 'clipboard.png' },
      method: 'xclip:image/png',
    })
  })

  it('parses mixed Wayland file lists while preserving only local file URLs', async () => {
    const fake = new FakeSubprocess()
    fake.set(['wl-paste', '--list-types'], 'text/uri-list\ntext/plain\n')
    fake.set(
      ['wl-paste', '--no-newline', '--type', 'text/uri-list'],
      '# Finder selection\nfile:///tmp/photo.png\nfile:///tmp/readme.txt\nhttps://example.test/nope\n',
    )
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('linux', { WAYLAND_DISPLAY: 'wayland-1' }),
    })).resolves.toEqual({
      ok: true,
      payload: { kind: 'files', paths: ['/tmp/photo.png', '/tmp/readme.txt'] },
      method: 'wl-paste:file-list',
    })
  })

  it('falls back from unavailable X11 xclip to xsel text', async () => {
    const fake = new FakeSubprocess()
    fake.unavailable('xclip')
    fake.set(['xsel', '--clipboard', '--output'], 'fallback text')
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('linux', { DISPLAY: ':0' }),
    })).resolves.toEqual({ ok: true, payload: { kind: 'text', text: 'fallback text' }, method: 'xsel:text' })
  })

  it('rejects headless SSH and unsupported Windows without spawning', async () => {
    const fake = new FakeSubprocess()
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('linux', { SSH_TTY: '/dev/pts/1' }),
    })).resolves.toMatchObject({ ok: false, reason: 'unsupported' })
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('win32', {}),
    })).resolves.toMatchObject({ ok: false, reason: 'unsupported' })
    expect(fake.spawns).toHaveLength(0)
  })

  it('enforces the complete byte limit before returning a payload', async () => {
    const fake = new FakeSubprocess()
    fake.set(['pbpaste', '-Prefer', 'public.file-url'], '12345')
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('darwin', {}), maxBytes: 4,
    })).resolves.toMatchObject({ ok: false, reason: 'too-large' })
    expect(fake.terminated).toHaveBeenCalled()
  })

  it('rejects bytes that do not match an advertised image target', async () => {
    const fake = new FakeSubprocess()
    fake.set(['xclip', '-selection', 'clipboard', '-target', 'TARGETS', '-out'], 'image/png\n')
    fake.set(['xclip', '-selection', 'clipboard', '-target', 'image/png', '-out'], 'not an image')
    await expect(readTuiClipboard(fake.runtime(), {
      cwd: '/workspace', environment: environment('linux', { DISPLAY: ':0' }),
    })).resolves.toEqual({
      ok: false,
      reason: 'invalid-media',
      message: 'System clipboard image bytes do not match their declared media type.',
    })
  })

  it('classifies command timeout and parent cancellation before spawning a child', async () => {
    const timeout = new FakeSubprocess()
    timeout.delayResolve('pbpaste')
    await expect(readTuiClipboard(timeout.runtime(), {
      cwd: '/workspace', environment: environment('darwin', {}), timeoutMs: 5,
    })).resolves.toMatchObject({ ok: false, reason: 'timeout' })
    expect(timeout.spawns).toHaveLength(0)

    const cancelled = new FakeSubprocess()
    cancelled.delayResolve('pbpaste')
    const controller = new AbortController()
    const pending = readTuiClipboard(cancelled.runtime(), {
      cwd: '/workspace', environment: environment('darwin', {}), signal: controller.signal,
    })
    controller.abort(new Error('test cancellation'))
    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'unavailable' })
    expect(cancelled.spawns).toHaveLength(0)
  })
})
