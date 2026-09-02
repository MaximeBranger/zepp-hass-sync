import { describe, expect, it, vi } from 'vitest'

// message.js only uses EventBus and a logger out of @zos/utils, and neither has anything to do with
// the handshake deadline under test.
vi.mock('@zos/utils', () => {
  class EventBus {
    constructor() {
      this.handlers = {}
    }
    on(name, fn) {
      ;(this.handlers[name] = this.handlers[name] || []).push(fn)
    }
    off(name) {
      delete this.handlers[name]
    }
    emit(name, ...args) {
      ;(this.handlers[name] || []).forEach((fn) => fn(...args))
    }
  }
  return {
    EventBus,
    log: { getLogger: () => ({ debug() {}, warn() {}, error() {}, log() {} }) },
  }
})

const { MessageBuilder } = await import('../../shared/message')

function builder() {
  // No `ble`: nothing is sent, so the shake is never answered unless the test answers it.
  return new MessageBuilder({ appId: 1, appDevicePort: 20, appSidePort: 0 })
}

describe('waitShake', () => {
  // The Refresh button's failure mode: the page opens a fresh connection per request, and once the
  // background service is competing for the BLE link the shake stops coming back. A pending-forever
  // promise leaves the caller's in-flight guard set, so every later tap is swallowed in silence.
  it('rejects once the timeout passes with no shake answer', async () => {
    await expect(builder().waitShake(20)).rejects.toThrow(/Handshake timed out in 20ms/)
  })

  it('resolves as soon as the shake is answered', async () => {
    const mb = builder()
    mb.shakeTask.resolve()
    await expect(mb.waitShake(20)).resolves.toBeUndefined()
  })

  // The timer still fires after a shake that won the race; it must not reject into nothing.
  it('does not reject after the shake won the race', async () => {
    const mb = builder()
    mb.shakeTask.resolve()

    await mb.waitShake(10)
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  it('applies the request timeout to the handshake', async () => {
    const mb = builder()
    const started = Date.now()

    await expect(mb.request({ method: 'GET_CONFIG' }, { timeout: 20 })).rejects.toThrow(/Handshake timed out/)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
