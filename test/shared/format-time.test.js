import { describe, expect, it } from 'vitest'
import { formatDateTime } from '../../shared/format-time'

describe('formatDateTime', () => {
  it('formats an epoch timestamp as DD/MM HH:mm', () => {
    const d = new Date(2024, 6, 17, 14, 32, 0)
    const epochSeconds = Math.floor(d.getTime() / 1000)
    expect(formatDateTime(epochSeconds)).toBe('17/07 14:32')
  })

  it('zero-pads single-digit day, month, hour and minute', () => {
    const d = new Date(2024, 0, 5, 9, 3, 0)
    const epochSeconds = Math.floor(d.getTime() / 1000)
    expect(formatDateTime(epochSeconds)).toBe('05/01 09:03')
  })
})
