import { describe, expect, it } from 'vitest'
import { clampIntervalMinutes, DEFAULT_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES } from '../../shared/constants'

describe('clampIntervalMinutes', () => {
  it('passes through a value already in range', () => {
    expect(clampIntervalMinutes(10)).toBe(10)
  })

  it('parses numeric strings', () => {
    expect(clampIntervalMinutes('10')).toBe(10)
  })

  it('clamps values above the max', () => {
    expect(clampIntervalMinutes(MAX_INTERVAL_MINUTES + 50)).toBe(MAX_INTERVAL_MINUTES)
  })

  it('clamps finite non-positive values to the min instead of the default', () => {
    expect(clampIntervalMinutes(0)).toBe(MIN_INTERVAL_MINUTES)
    expect(clampIntervalMinutes(-5)).toBe(MIN_INTERVAL_MINUTES)
  })

  it('falls back to the default for non-finite input', () => {
    expect(clampIntervalMinutes('garbage')).toBe(DEFAULT_INTERVAL_MINUTES)
    expect(clampIntervalMinutes(undefined)).toBe(DEFAULT_INTERVAL_MINUTES)
    expect(clampIntervalMinutes(NaN)).toBe(DEFAULT_INTERVAL_MINUTES)
  })
})
