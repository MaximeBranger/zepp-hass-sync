import { describe, expect, it } from 'vitest'
import { Deferred, timeout } from '../../shared/defer'

describe('Deferred', () => {
  it('resolves its promise when resolve() is called', async () => {
    const defer = Deferred()
    defer.resolve('value')
    await expect(defer.promise).resolves.toBe('value')
  })

  it('rejects its promise when reject() is called', async () => {
    const defer = Deferred()
    defer.reject(new Error('boom'))
    await expect(defer.promise).rejects.toThrow('boom')
  })
})

describe('timeout', () => {
  it('rejects with a timeout message when no callback is given', async () => {
    await expect(timeout(5)).rejects.toBe('Timed out in 5ms.')
  })

  it('calls the callback with resolve/reject after the delay', async () => {
    const result = await timeout(5, (resolve) => resolve('done'))
    expect(result).toBe('done')
  })
})
