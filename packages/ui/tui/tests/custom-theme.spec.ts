import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTuiCustomThemes, loadTuiCustomTheme, resolveTuiTheme } from '../src/index.ts'

const originalDshHome = process.env.DSH_HOME
const temporaryHomes: string[] = []

afterEach(async () => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  await Promise.all(temporaryHomes.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function themesHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-tui-theme-'))
  temporaryHomes.push(home)
  process.env.DSH_HOME = home
  const themes = join(home, 'themes')
  await mkdir(themes)
  return themes
}

describe('TUI custom themes', () => {
  it('discovers bounded declarative palettes and merges them only for extended color', async () => {
    const themes = await themesHome()
    await writeFile(join(themes, 'nord.json'), JSON.stringify({
      name: 'Nord', base: 'dark', dim: false,
      tokens: { accent: '#88c0d0', warning: 'yellowBright' },
    }))
    const available = await listTuiCustomThemes()
    expect(available).toHaveLength(1)
    expect(available[0]).toMatchObject({ fileName: 'nord.json', theme: { name: 'Nord', base: 'dark', dim: false } })
    expect(resolveTuiTheme('auto', 'truecolor', 'light', available[0]?.theme)).toMatchObject({
      resolvedPreference: 'dark', customName: 'Nord', dim: false,
      tokens: { accent: '#88c0d0', warning: 'yellowBright' },
    })
    expect(resolveTuiTheme('auto', 'ansi16', 'light', available[0]?.theme)).toMatchObject({
      resolvedPreference: 'dark', tokens: { accent: 'cyan' },
    })
  })

  it('rejects traversal, executable values, unknown tokens, and oversized files', async () => {
    const themes = await themesHome()
    await writeFile(join(themes, 'invalid.json'), JSON.stringify({
      name: 'Bad', base: 'dark', tokens: { accent: 'rgb(1, 2, 3)', script: 'run me' },
    }))
    await writeFile(join(themes, 'large.json'), ' '.repeat(16 * 1_024 + 1))
    await expect(loadTuiCustomTheme('../invalid.json')).rejects.toThrow(/one JSON file name/u)
    await expect(loadTuiCustomTheme('invalid.json')).rejects.toThrow()
    await expect(loadTuiCustomTheme('large.json')).rejects.toThrow(/exceeds/u)
    await expect(listTuiCustomThemes()).resolves.toEqual([])
  })
})
