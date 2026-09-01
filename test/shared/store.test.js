import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ files: new Map(), state: { readThrows: false, writeThrows: false } }))

vi.mock('@zos/fs', () => ({
  // `readFileSync` is documented to return `undefined` when the read fails, which includes a file
  // that was never created — the case every "fresh install" expectation below exercises.
  readFileSync: ({ path }) => {
    if (fs.state.readThrows) throw new Error('fs unavailable in this context')
    return fs.files.has(path) ? fs.files.get(path) : undefined
  },
  writeFileSync: ({ path, data }) => {
    if (fs.state.writeThrows) throw new Error('fs unavailable in this context')
    fs.files.set(path, data)
  },
}))

vi.mock('@zos/utils', () => ({ log: { getLogger: () => ({ log: () => {}, error: () => {} }) } }))

const { PAGE_STORE, readField, readStore, updateStore } = await import('../../shared/store')

beforeEach(() => {
  fs.files.clear()
  fs.state.readThrows = false
  fs.state.writeThrows = false
})

describe('readStore', () => {
  it('returns an empty object for a file that does not exist yet', () => {
    expect(readStore(PAGE_STORE)).toEqual({})
  })

  it('returns an empty object for an unparseable file rather than throwing', () => {
    fs.files.set(PAGE_STORE, '{ this is not json')
    expect(readStore(PAGE_STORE)).toEqual({})
  })

  it('returns an empty object for JSON that is not an object', () => {
    fs.files.set(PAGE_STORE, '"a string"')
    expect(readStore(PAGE_STORE)).toEqual({})
  })

  // Every caller is a diagnostic or a status read; in the App Service an escaping error ends the
  // background sync entirely.
  it('returns an empty object instead of throwing when the filesystem is unavailable', () => {
    fs.state.readThrows = true
    expect(readStore(PAGE_STORE)).toEqual({})
  })
})

describe('updateStore', () => {
  it('round-trips a written field', () => {
    updateStore(PAGE_STORE, { a: 1 })
    expect(readStore(PAGE_STORE)).toEqual({ a: 1 })
  })

  it('merges into existing fields rather than replacing the file', () => {
    updateStore(PAGE_STORE, { a: 1, b: 2 })
    updateStore(PAGE_STORE, { b: 3 })
    expect(readStore(PAGE_STORE)).toEqual({ a: 1, b: 3 })
  })

  it('reports failure instead of throwing when the write fails', () => {
    fs.state.writeThrows = true
    expect(updateStore(PAGE_STORE, { a: 1 })).toBe(false)
  })

  // Read-modify-write is only safe because the app/page VM is the sole writer. This pins down that
  // each store is an independent file, so adding a second store never means sharing one.
  it('keeps separate stores independent', () => {
    updateStore(PAGE_STORE, { shared: 'from-page' })
    updateStore('other-state.json', { shared: 'from-elsewhere' })

    expect(readStore(PAGE_STORE)).toEqual({ shared: 'from-page' })
    expect(readStore('other-state.json')).toEqual({ shared: 'from-elsewhere' })
  })
})

describe('readField', () => {
  it('returns the fallback for a field that was never written', () => {
    expect(readField(PAGE_STORE, 'missing', 'fallback')).toBe('fallback')
  })

  // Rendering a missing value as `false` rather than "unknown" is what once made the watch report a
  // failure for a cycle that had never run.
  it('distinguishes a recorded false from a missing field', () => {
    expect(readField(PAGE_STORE, 'flag', null)).toBe(null)
    updateStore(PAGE_STORE, { flag: false })
    expect(readField(PAGE_STORE, 'flag', null)).toBe(false)
  })

  it('returns a recorded 0 rather than collapsing it into the fallback', () => {
    updateStore(PAGE_STORE, { count: 0 })
    expect(readField(PAGE_STORE, 'count', null)).toBe(0)
  })
})
