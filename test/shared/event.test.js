import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '../../shared/event'

describe('EventBus', () => {
  it('invokes listeners registered for the emitted type with the emitted args', () => {
    const bus = new EventBus()
    const cb = vi.fn()
    bus.on('data', cb)
    bus.emit('data', 1, 2)
    expect(cb).toHaveBeenCalledWith(1, 2)
  })

  it('supports multiple listeners for the same type', () => {
    const bus = new EventBus()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    bus.on('data', cb1)
    bus.on('data', cb2)
    bus.emit('data')
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('does not throw when emitting a type with no listeners', () => {
    const bus = new EventBus()
    expect(() => bus.emit('nothing')).not.toThrow()
  })

  it('off(type, cb) removes only that listener', () => {
    const bus = new EventBus()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    bus.on('data', cb1)
    bus.on('data', cb2)
    bus.off('data', cb1)
    bus.emit('data')
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('off(type) removes all listeners for that type only', () => {
    const bus = new EventBus()
    const dataCb = vi.fn()
    const otherCb = vi.fn()
    bus.on('data', dataCb)
    bus.on('other', otherCb)
    bus.off('data')
    bus.emit('data')
    bus.emit('other')
    expect(dataCb).not.toHaveBeenCalled()
    expect(otherCb).toHaveBeenCalledTimes(1)
  })

  it('off() with no args clears every listener', () => {
    const bus = new EventBus()
    const dataCb = vi.fn()
    const otherCb = vi.fn()
    bus.on('data', dataCb)
    bus.on('other', otherCb)
    bus.off()
    bus.emit('data')
    bus.emit('other')
    expect(dataCb).not.toHaveBeenCalled()
    expect(otherCb).not.toHaveBeenCalled()
  })
})
