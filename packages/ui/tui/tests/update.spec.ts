/** Compatibility-aware passive update discovery. */

import { describe, expect, it } from 'vitest'
import {
  selectTuiCompatibleVersion, tuiUpdateStatus, TUI_RUNTIME_VERSION,
} from '../src/update.ts'

describe('native TUI passive update discovery', () => {
  it('selects the highest release targeting the same official DSH prerelease suffix', () => {
    expect(selectTuiCompatibleVersion('0.1.9-rc.1', [
      '0.1.7-rc.1', '0.2.0-alpha.1', '0.1.10-rc.1', '0.1.9-rc.1', 'invalid',
    ])).toBe('0.1.10-rc.1')
    expect(selectTuiCompatibleVersion('0.1.9-rc.1', ['0.2.0-alpha.1'])).toBeUndefined()
  })

  it('recommends an exact external command and never crosses compatibility lines', () => {
    expect(TUI_RUNTIME_VERSION).toBe('0.1.11-rc.2')
    const compatible = tuiUpdateStatus('0.1.12-rc.2')
    expect(compatible).toMatchObject({ compatible: true, updateAvailable: true })
    expect(compatible.command).toContain('@lingxi-ai-cn/dsh-tui@0.1.12-rc.2')

    const incompatible = tuiUpdateStatus('0.2.0-alpha.1')
    expect(incompatible).toMatchObject({ compatible: false, updateAvailable: false })
    expect(incompatible.command).toBeUndefined()
  })
})
