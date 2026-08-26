/** Compatibility-aware passive update discovery. */

import { describe, expect, it } from 'vitest'
import {
  selectTuiCompatibleVersion, tuiUpdateStatus, TUI_RUNTIME_VERSION,
} from '../src/update.ts'

describe('native TUI passive update discovery', () => {
  it('selects the highest release targeting the same official DSH prerelease suffix', () => {
    expect(selectTuiCompatibleVersion('0.1.6-rc.8', [
      '0.1.5-rc.8', '0.2.0-rc.9', '0.1.8-rc.8', '0.1.7-rc.8', 'invalid',
    ])).toBe('0.1.8-rc.8')
    expect(selectTuiCompatibleVersion('0.1.6-rc.8', ['0.2.0-rc.9'])).toBeUndefined()
  })

  it('recommends an exact external command and never crosses compatibility lines', () => {
    expect(TUI_RUNTIME_VERSION).toBe('0.1.6-rc.8')
    const compatible = tuiUpdateStatus('0.1.7-rc.8')
    expect(compatible).toMatchObject({ compatible: true, updateAvailable: true })
    expect(compatible.command).toContain('@lingxi-ai-cn/dsh-tui@0.1.7-rc.8')

    const incompatible = tuiUpdateStatus('0.2.0-rc.9')
    expect(incompatible).toMatchObject({ compatible: false, updateAvailable: false })
    expect(incompatible.command).toBeUndefined()
  })
})
