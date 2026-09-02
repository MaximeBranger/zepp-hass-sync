// app-side/index.js is the phone half of every exchange, and until now the only untested one. It is
// also the single point the watch face depends on for anything it cannot observe itself: a
// background send changes nothing on the watch, so the *only* way it ever reaches the screen is the
// `background` object this file attaches to its replies.
//
// These tests drive the real request handler with a fake settingsStorage and a fake webhook, and
// assert on the reply the watch would actually receive.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MESSAGE_METHOD_GET_CONFIG,
  MESSAGE_METHOD_SEND,
  MESSAGE_SOURCE_SERVICE,
  SERVICE_TRIGGER_ALARM,
  SERVICE_TRIGGER_PAGE,
  SETTINGS_KEY_LAST_SEND_TIME,
  SETTINGS_KEY_SEND_INTERVAL_MINUTES,
  SETTINGS_KEY_WEBHOOK_URL,
} from '../../shared/constants'

// The ambient globals the Zepp app-side context injects, plus the one module the file imports.
const harness = vi.hoisted(() => ({
  storage: new Map(),
  handlers: {},
  service: null,
  fetchResult: { status: 204 },
  fetchCalls: [],
}))

vi.mock('../../shared/message-side', () => ({
  MessageBuilder: class {
    listen() {}
    on(event, handler) {
      harness.handlers[event] = handler
    }
    // The real one decodes a BLE buffer; the tests hand it the object directly.
    buf2Json(payload) {
      return payload
    }
  },
}))

globalThis.Logger = { getLogger: () => ({ log: () => {}, error: () => {} }) }
globalThis.settings = {
  settingsStorage: {
    getItem: (key) => (harness.storage.has(key) ? harness.storage.get(key) : null),
    setItem: (key, value) => harness.storage.set(key, value),
  },
}
globalThis.fetch = (options) => {
  harness.fetchCalls.push(options)
  return Promise.resolve(harness.fetchResult)
}
globalThis.AppSideService = (service) => {
  harness.service = service
}

await import('../../app-side/index')

// Drives one request through the handler and resolves with the `data` the watch would receive.
function request(payload) {
  return new Promise((resolve) => {
    harness.handlers.request({ request: { payload }, response: ({ data }) => resolve(data) })
  })
}

beforeEach(() => {
  harness.storage.clear()
  harness.fetchResult = { status: 204 }
  harness.fetchCalls = []
  harness.storage.set(SETTINGS_KEY_WEBHOOK_URL, 'https://hass.local/api/webhook/abc')
  harness.storage.set(SETTINGS_KEY_SEND_INTERVAL_MINUTES, '15')
  harness.service.onInit()
})

describe('SEND', () => {
  it('posts the payload to the configured webhook', async () => {
    await request({ method: MESSAGE_METHOD_SEND, payload: { steps: 1200 } })

    expect(harness.fetchCalls).toHaveLength(1)
    expect(harness.fetchCalls[0].url).toBe('https://hass.local/api/webhook/abc')
    expect(harness.fetchCalls[0].method).toBe('POST')
  })

  it('records the outcome where the watch can read it back', async () => {
    await request({ method: MESSAGE_METHOD_SEND, payload: {} })
    expect(Number(harness.storage.get(SETTINGS_KEY_LAST_SEND_TIME))).toBeGreaterThan(0)
  })

  // The whole reason the reply carries a summary at all.
  it('reports the send back in the reply, so the watch can show a send it never saw', async () => {
    const data = await request({
      method: MESSAGE_METHOD_SEND,
      payload: {},
      source: MESSAGE_SOURCE_SERVICE,
      trigger: SERVICE_TRIGGER_ALARM,
    })

    expect(data.background.sendOk).toBe(true)
    expect(data.background.sendTime).toBeGreaterThan(0)
    expect(data.background.sendError).toBe('')
  })

  it('carries the failure text, not just the failure', async () => {
    harness.fetchResult = { status: 401 }
    const data = await request({ method: MESSAGE_METHOD_SEND, payload: {} })

    expect(data.ok).toBe(false)
    expect(data.background.sendOk).toBe(false)
    expect(data.background.sendError).toContain('401')
    expect(data.background.sendTime).toBeGreaterThan(0)
  })

  // Counted on delivery rather than on webhook success: the question the count answers is whether
  // the service is reaching the phone, which a bad webhook URL must not mask.
  it('counts an alarm-woken send apart from one the app produced', async () => {
    await request({
      method: MESSAGE_METHOD_SEND,
      payload: {},
      source: MESSAGE_SOURCE_SERVICE,
      trigger: SERVICE_TRIGGER_PAGE,
    })
    let data = await request({ method: MESSAGE_METHOD_GET_CONFIG })
    expect(data.background.count).toBe(1)
    expect(data.background.alarmCount).toBe(0)

    await request({
      method: MESSAGE_METHOD_SEND,
      payload: {},
      source: MESSAGE_SOURCE_SERVICE,
      trigger: SERVICE_TRIGGER_ALARM,
    })
    data = await request({ method: MESSAGE_METHOD_GET_CONFIG })
    expect(data.background.count).toBe(2)
    expect(data.background.alarmCount).toBe(1)
  })

  it('reports a missing webhook without calling out', async () => {
    harness.storage.set(SETTINGS_KEY_WEBHOOK_URL, '')
    const data = await request({ method: MESSAGE_METHOD_SEND, payload: {} })

    expect(harness.fetchCalls).toHaveLength(0)
    expect(data.ok).toBe(false)
    expect(data.configured).toBe(false)
  })
})

describe('GET_CONFIG', () => {
  it('answers with the config and moves no health data', async () => {
    const data = await request({ method: MESSAGE_METHOD_GET_CONFIG })

    expect(data).toMatchObject({ ok: true, intervalMinutes: 15, configured: true })
    expect(harness.fetchCalls).toHaveLength(0)
  })

  // This is the path that actually updates the watch face: the app pulls config on every open, and
  // that reply is what carries a background send's outcome home.
  it('carries the last send the phone handled, from a previous exchange', async () => {
    await request({
      method: MESSAGE_METHOD_SEND,
      payload: {},
      source: MESSAGE_SOURCE_SERVICE,
      trigger: SERVICE_TRIGGER_ALARM,
    })

    const data = await request({ method: MESSAGE_METHOD_GET_CONFIG })
    expect(data.background.sendOk).toBe(true)
    expect(data.background.sendTime).toBeGreaterThan(0)
  })

  it('reports zeroes rather than nothing before any send has happened', async () => {
    const data = await request({ method: MESSAGE_METHOD_GET_CONFIG })

    expect(data.background.sendTime).toBe(0)
    expect(data.background.count).toBe(0)
  })
})
