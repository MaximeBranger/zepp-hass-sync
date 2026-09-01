import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ files: new Map(), state: { readThrows: false, writeThrows: false } }))

vi.mock('@zos/fs', () => ({
  readFileSync: ({ path }) => {
    if (fs.state.readThrows) throw new Error('fs unavailable in this context')
    return fs.files.has(path) ? fs.files.get(path) : undefined
  },
  writeFileSync: ({ path, data }) => {
    if (fs.state.writeThrows) throw new Error('fs unavailable in this context')
    fs.files.set(path, data)
  },
}))

const queryPermission = vi.fn()
const requestPermission = vi.fn()
vi.mock('@zos/app', () => ({
  queryPermission: (...args) => queryPermission(...args),
  requestPermission: (...args) => requestPermission(...args),
}))

const start = vi.fn()
const stop = vi.fn()
const getAllAppServices = vi.fn()
vi.mock('@zos/app-service', () => ({
  start: (...args) => start(...args),
  stop: (...args) => stop(...args),
  getAllAppServices: (...args) => getAllAppServices(...args),
}))

vi.mock('@zos/utils', () => ({ log: { getLogger: () => ({ log: () => {}, error: () => {} }) } }))

const { ensureServiceRunning, isServiceRunning, requestBgServicePermission, restartService } =
  await import('../../shared/service-boot')
const {
  getLastPermissionQuery,
  getLastPermissionRequest,
  getLastServiceStartResult,
} = await import('../../shared/sync-status')
const { decodeServiceParam } = await import('../../shared/constants')

const SERVICE_FILE = 'app-service/index'
const INTERVAL = 5

beforeEach(() => {
  fs.files.clear()
  vi.clearAllMocks()
  getAllAppServices.mockReturnValue([])
  start.mockReturnValue(0)
  // Default: stop() succeeds and reports through its callback, as it does in the page's VM.
  stop.mockImplementation(({ complete_func }) => {
    complete_func({ result: true })
    return 0
  })
  queryPermission.mockReturnValue([0])
  requestPermission.mockReturnValue(0)
})

describe('isServiceRunning', () => {
  it('reports the service running when the OS lists it', () => {
    getAllAppServices.mockReturnValue([SERVICE_FILE])
    expect(isServiceRunning()).toBe(true)
  })

  it('reports not running when the OS lists other services only', () => {
    getAllAppServices.mockReturnValue(['some/other-service'])
    expect(isServiceRunning()).toBe(false)
  })

  // This API is itself gated on the bg_service permission, so it can fail exactly when the
  // interesting case is happening — it must never take the caller down with it.
  it('reports not running instead of throwing when the API fails', () => {
    getAllAppServices.mockImplementation(() => {
      throw new Error('no permission')
    })
    expect(isServiceRunning()).toBe(false)
  })
})

describe('ensureServiceRunning', () => {
  // Residency is never healthy any more: the service ends itself the moment its sync completes,
  // exactly so the next alarm finds the slot free. One still listed is stuck, and a stuck one is
  // fatal rather than untidy — `start()` against a live service is a no-op, so every subsequent
  // alarm firing does nothing at all. Opening the app is the one reliable way to clear it.
  it('always replaces a resident service', () => {
    getAllAppServices.mockReturnValue([SERVICE_FILE])
    const order = []
    stop.mockImplementation(({ complete_func }) => {
      order.push('stop')
      complete_func({ result: true })
      return 0
    })
    start.mockImplementation(() => {
      order.push('start')
      return 0
    })
    const onSettled = vi.fn()

    expect(ensureServiceRunning(30, onSettled)).toBe(true)

    expect(order).toEqual(['stop', 'start'])
    expect(stop.mock.calls[0][0].file).toBe(SERVICE_FILE)
    expect(decodeServiceParam(start.mock.calls[0][0].param).intervalMinutes).toBe(30)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  // The device state this was written for: a watch still carrying a resident service left behind by
  // an older build of the app, which reported `run:1 a:0` and could never have recovered on its own.
  it('replaces a resident service started at the same interval', () => {
    getAllAppServices.mockReturnValue([SERVICE_FILE])

    ensureServiceRunning(INTERVAL)

    expect(stop).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  // stop() reports through a callback, and a non-zero return means no callback is coming — the same
  // trap requestPermission's return value set. Starting anyway is harmless: start() against a still
  // resident service is a no-op.
  it('still starts when stop() reports it never got under way', () => {
    getAllAppServices.mockReturnValue([SERVICE_FILE])
    stop.mockReturnValue(2)
    const onSettled = vi.fn()

    ensureServiceRunning(INTERVAL, onSettled)

    expect(start).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('still starts when stop() throws', () => {
    getAllAppServices.mockReturnValue([SERVICE_FILE])
    stop.mockImplementation(() => {
      throw new Error('unsupported')
    })
    const onSettled = vi.fn()

    ensureServiceRunning(INTERVAL, onSettled)

    expect(start).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('starts the service when the permission is already granted', () => {
    queryPermission.mockReturnValue([2])
    const onSettled = vi.fn()

    expect(ensureServiceRunning(INTERVAL, onSettled)).toBe(true)

    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0].file).toBe(SERVICE_FILE)
    expect(getLastPermissionQuery()).toBe(2)
    expect(getLastServiceStartResult()).toBe(0)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  // The service has no storage and no other inbound channel: `param` is the only way the pace and
  // the trigger reach it. Losing either is silent — it would just sync at the default forever, and
  // every sync would look like the app had been opened.
  it('carries the trigger and the interval in the start param', async () => {
    const { SERVICE_TRIGGER_PAGE } = await import('../../shared/constants')
    queryPermission.mockReturnValue([2])

    ensureServiceRunning(42)

    expect(decodeServiceParam(start.mock.calls[0][0].param)).toEqual({
      trigger: SERVICE_TRIGGER_PAGE,
      intervalMinutes: 42,
    })
  })

  it('records the failure code when start() fails', () => {
    queryPermission.mockReturnValue([2])
    start.mockReturnValue(3)

    ensureServiceRunning(INTERVAL)

    expect(getLastServiceStartResult()).toBe(3)
  })

  // This runs during the page's build(). An automatic dialog there races the page's own
  // construction — on device it came back denied, leaving nothing on screen to say what had happened
  // or how to retry, a state only reinstalling the app could escape. The dialog now belongs to a
  // button the user taps; see requestBgServicePermission below.
  it('never raises a dialog, and reports that the permission is missing', () => {
    queryPermission.mockReturnValue([0])
    const onSettled = vi.fn()

    expect(ensureServiceRunning(INTERVAL, onSettled)).toBe(false)

    expect(requestPermission).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    expect(getLastServiceStartResult()).toBe('needs-permission')
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('reports the permission missing without prompting when queryPermission throws', () => {
    queryPermission.mockImplementation(() => {
      throw new Error('unsupported')
    })

    expect(ensureServiceRunning(INTERVAL)).toBe(false)

    expect(requestPermission).not.toHaveBeenCalled()
    expect(getLastPermissionQuery()).toBe('threw')
  })

  // start() is documented as returning 0 on success but typed as returning a boolean; a firmware
  // picking the boolean convention must not be recorded as a failure.
  it('records a boolean start() return as-is', () => {
    queryPermission.mockReturnValue([2])
    start.mockReturnValue(true)

    ensureServiceRunning(INTERVAL)

    expect(getLastServiceStartResult()).toBe(true)
  })

  it('records, and settles, when start() itself throws', () => {
    queryPermission.mockReturnValue([2])
    start.mockImplementation(() => {
      throw new Error('out of memory')
    })
    const onSettled = vi.fn()

    ensureServiceRunning(INTERVAL, onSettled)

    expect(getLastServiceStartResult()).toBe('threw:out of memory')
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  // Every branch must leave a trace: a boot that records nothing is exactly the state that made the
  // original failure undiagnosable on-device.
  it('always records a start result, whichever path it took', () => {
    const paths = [
      () => getAllAppServices.mockReturnValue([SERVICE_FILE]),
      () => queryPermission.mockReturnValue([2]),
      () => queryPermission.mockReturnValue([0]),
    ]

    for (const setUpPath of paths) {
      fs.files.clear()
      setUpPath()
      ensureServiceRunning(INTERVAL)
      expect(getLastServiceStartResult()).not.toBe(null)
    }
  })

  it('survives an onSettled callback that throws', () => {
    queryPermission.mockReturnValue([2])
    expect(() =>
      ensureServiceRunning(INTERVAL, () => {
        throw new Error('render failed')
      }),
    ).not.toThrow()
  })
})

// The page calls this directly when the user changes the pace, since that is the only way to tell a
// running service about a new interval.
describe('restartService', () => {
  it('stops, then starts on the new pace, and settles once', () => {
    getAllAppServices.mockReturnValue([SERVICE_FILE])
    const order = []
    stop.mockImplementation(({ complete_func }) => {
      order.push('stop')
      complete_func({ result: true })
      return 0
    })
    start.mockImplementation(() => {
      order.push('start')
      return 0
    })
    const onSettled = vi.fn()

    restartService(30, onSettled)

    expect(order).toEqual(['stop', 'start'])
    expect(decodeServiceParam(start.mock.calls[0][0].param).intervalMinutes).toBe(30)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  // It renders diagnostics, and a page that throws mid-render must not take the restart down with
  // it — the service is already started by then.
  it('survives an onSettled callback that throws', () => {
    expect(() =>
      restartService(30, () => {
        throw new Error('render failed')
      }),
    ).not.toThrow()
  })
})

// Raises the dialog and reports back. It deliberately does not start anything: asking for the
// permission and deciding the worker should run are separate questions, and the caller owns the
// second one — the dialog goes up on first launch, before the phone has ever been reached, so a
// grant here must not start a worker on a pace nobody has confirmed.
describe('requestBgServicePermission', () => {
  it('never starts the service itself, whatever the dialog reports', () => {
    let dialogCallback
    requestPermission.mockImplementation(({ callback }) => {
      dialogCallback = callback
      return 0
    })
    queryPermission.mockReturnValue([2])

    requestBgServicePermission(() => {})
    dialogCallback([2])

    expect(start).not.toHaveBeenCalled()
  })

  // The regression this module was written for. requestPermission returning 2 ("already
  // authorized") means no dialog is shown and the callback never fires — the old code waited on
  // that callback forever, so nothing ever happened and nothing was ever recorded, leaving the
  // watch with no way to tell that state apart from the app never having run.
  it('answers when requestPermission returns 2 and never calls back', () => {
    requestPermission.mockReturnValue(2)
    const onAnswered = vi.fn()

    requestBgServicePermission(onAnswered)

    expect(getLastPermissionRequest()).toBe(2)
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })

  // Same silent path, other cause: 1 means there is nothing that can be requested.
  it('answers when requestPermission returns 1 and never calls back', () => {
    requestPermission.mockReturnValue(1)
    const onAnswered = vi.fn()

    requestBgServicePermission(onAnswered)

    expect(getLastPermissionRequest()).toBe(1)
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })

  it('waits for the dialog when a callback is coming, then answers once', () => {
    let dialogCallback
    requestPermission.mockImplementation(({ callback }) => {
      dialogCallback = callback
      return 0
    })
    queryPermission.mockReturnValue([2])
    const onAnswered = vi.fn()

    requestBgServicePermission(onAnswered)
    expect(onAnswered).not.toHaveBeenCalled()

    dialogCallback([2])

    expect(getLastPermissionQuery()).toBe(2)
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })

  // On device, accepting the dialog still reports 0 ("not authorized") in this callback — the grant
  // only reads back as granted on a later open. The re-query is a second chance at a fresher
  // answer; believing the callback's code instead is what once made the app declare failure for a
  // permission the user had just granted.
  it('re-queries rather than trusting the code the dialog reports', () => {
    let dialogCallback
    requestPermission.mockImplementation(({ callback }) => {
      dialogCallback = callback
      return 0
    })
    queryPermission.mockReturnValue([2])

    requestBgServicePermission()
    dialogCallback([0])

    expect(getLastPermissionQuery()).toBe(2)
  })

  // The re-query is an improvement, not a requirement — a firmware where it fails must still answer.
  it('still answers when the re-query throws', () => {
    let dialogCallback
    requestPermission.mockImplementation(({ callback }) => {
      dialogCallback = callback
      return 0
    })
    queryPermission.mockImplementation(() => {
      throw new Error('unsupported')
    })
    const onAnswered = vi.fn()

    requestBgServicePermission(onAnswered)
    dialogCallback([2])

    expect(getLastPermissionQuery()).toBe(2)
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })

  it('records, and answers, when requestPermission itself throws', () => {
    requestPermission.mockImplementation(() => {
      throw new Error('unsupported')
    })
    const onAnswered = vi.fn()

    requestBgServicePermission(onAnswered)

    expect(getLastPermissionRequest()).toBe('threw')
    expect(onAnswered).toHaveBeenCalledTimes(1)
  })

  it('survives an onAnswered callback that throws', () => {
    requestPermission.mockReturnValue(2)
    expect(() =>
      requestBgServicePermission(() => {
        throw new Error('render failed')
      }),
    ).not.toThrow()
  })
})
