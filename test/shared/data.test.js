import { describe, expect, it } from 'vitest'
import { bin2buf, bin2hex, buf2hex, buf2json, buf2str, json2buf, json2str, str2buf, str2json } from '../../shared/data'

describe('data conversions', () => {
  it('round-trips JSON through str2json/json2str', () => {
    const obj = { a: 1, b: 'two', c: [1, 2, 3] }
    expect(str2json(json2str(obj))).toEqual(obj)
  })

  it('round-trips strings through str2buf/buf2str', () => {
    expect(buf2str(str2buf('hello world'))).toBe('hello world')
  })

  it('round-trips JSON through json2buf/buf2json', () => {
    const obj = { nested: { value: true }, list: ['x', 'y'] }
    expect(buf2json(json2buf(obj))).toEqual(obj)
  })

  it('converts a byte array to a hex string', () => {
    expect(bin2hex([0, 255, 16])).toBe('00ff10')
  })

  it('bin2buf produces a Buffer wrapping the given bytes', () => {
    const buf = bin2buf([1, 2, 3])
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect([...buf]).toEqual([1, 2, 3])
  })

  it('buf2hex matches Buffer.toString("hex")', () => {
    const buf = Buffer.from([222, 173, 190, 239])
    expect(buf2hex(buf)).toBe('deadbeef')
  })
})
