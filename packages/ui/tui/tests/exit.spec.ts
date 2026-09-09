/** The package hands terminal ownership back before notifying its launcher. */
import { expect, it, vi } from 'vitest'
import { requestTuiExit } from '../src/exit.ts'

it('restores the terminal before notifying the launcher', () => {
  const order: string[] = []
  requestTuiExit(() => { order.push('restore') }, () => { order.push('exit') })
  expect(order).toEqual(['restore', 'exit'])
})

it('restores during owner disposal without requesting another application exit', () => {
  const restore = vi.fn()
  requestTuiExit(restore, undefined)
  expect(restore).toHaveBeenCalledOnce()
})
