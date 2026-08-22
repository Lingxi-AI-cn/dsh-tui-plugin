import { describe, expect, it } from 'vitest'
import { resolveTuiComposerDelivery, tuiRunningDeliveryHelpLines } from '../src/delivery.ts'

const key = (value: Record<string, boolean>) => value

describe('running composer delivery', () => {
  it('keeps Enter as steer and selects queued follow-up with Tab', () => {
    const base = {
      composerOwnsInput: true, rootView: true, running: true, hasDraft: true, suggestionVisible: false,
    }
    expect(resolveTuiComposerDelivery({ ...base, key: key({ return: true }) })).toBe('steer')
    expect(resolveTuiComposerDelivery({ ...base, key: key({ tab: true }) })).toBe('followup')
  })

  it('selects interrupt-and-send only for Ctrl+Enter', () => {
    const base = {
      composerOwnsInput: true, rootView: true, running: true, hasDraft: true, suggestionVisible: false,
    }
    expect(resolveTuiComposerDelivery({ ...base, key: key({ ctrl: true, return: true }) })).toBe('interrupt')
    expect(resolveTuiComposerDelivery({ ...base, key: key({ ctrl: true, tab: true }) })).toBeUndefined()
  })

  it('leaves dialog, suggestion, idle, empty, and child ownership unchanged', () => {
    const base = {
      composerOwnsInput: true, rootView: true, running: true, hasDraft: true,
      suggestionVisible: false, key: key({ tab: true }),
    }
    expect(resolveTuiComposerDelivery({ ...base, composerOwnsInput: false, key: key({ return: true }) }))
      .toBeUndefined()
    expect(resolveTuiComposerDelivery({ ...base, suggestionVisible: true })).toBeUndefined()
    expect(resolveTuiComposerDelivery({ ...base, hasDraft: false })).toBeUndefined()
    expect(resolveTuiComposerDelivery({ ...base, running: false })).toBeUndefined()
    expect(resolveTuiComposerDelivery({ ...base, rootView: false })).toBeUndefined()
  })

  it('documents every running route in bounded help rows', () => {
    expect(tuiRunningDeliveryHelpLines().map(line => line.text)).toEqual([
      'Running input',
      '  Enter  Steer the current turn',
      '  Tab    Queue a follow-up turn',
      '  Ctrl+Enter  Interrupt, then queue',
      '  Alt+Up  Reclaim pending input',
    ])
  })
})
