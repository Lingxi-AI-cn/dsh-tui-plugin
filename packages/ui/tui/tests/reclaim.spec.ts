import { describe, expect, it } from 'vitest'
import { createUserMessage } from '../src/host.ts'
import { selectTuiReclaimableMessage, tuiReclaimMessageText } from '../src/reclaim.ts'

function message(text: string, source: 'user' | 'plugin' = 'user') {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: source === 'user' ? { kind: 'user' } : { kind: 'test' },
  })
}

describe('TUI pending input reclaim', () => {
  it('selects the newest process-owned user message by exact id', () => {
    const first = message('first')
    const second = message('second')
    expect(selectTuiReclaimableMessage([first, second], [first.id, second.id])).toBe(second)
    expect(tuiReclaimMessageText(second)).toBe('second')
  })

  it('ignores claimed, foreign, and non-user messages', () => {
    const foreign = message('foreign')
    const tool = message('plugin', 'plugin')
    expect(selectTuiReclaimableMessage([foreign], ['unknown-id'])).toBeUndefined()
    expect(selectTuiReclaimableMessage([tool], [tool.id])).toBeUndefined()
  })
})
