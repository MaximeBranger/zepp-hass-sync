import { beforeEach, describe, expect, it } from 'vitest'

globalThis.Logger = {
  getLogger: () => ({ debug() {}, warn() {}, error() {}, log() {} }),
}

const {
  MessageBuilder,
  MessageFlag,
  MessageVersion,
  MessageType,
  MessagePayloadOpCode,
  MessagePayloadDataTypeOp,
  DataType,
  getDataType,
  genTraceId,
  genSpanId,
  getTimestamp,
} = await import('../../shared/message-side')

describe('getDataType', () => {
  it('maps known type names to their opcode, case-insensitively', () => {
    expect(getDataType('json')).toBe(MessagePayloadDataTypeOp.JSON)
    expect(getDataType('JSON')).toBe(MessagePayloadDataTypeOp.JSON)
    expect(getDataType('text')).toBe(MessagePayloadDataTypeOp.TEXT)
    expect(getDataType('bin')).toBe(MessagePayloadDataTypeOp.BIN)
    expect(getDataType('empty')).toBe(MessagePayloadDataTypeOp.EMPTY)
  })

  it('falls back to TEXT for unknown type names', () => {
    expect(getDataType('nonsense')).toBe(MessagePayloadDataTypeOp.TEXT)
  })
})

describe('genTraceId / genSpanId', () => {
  it('produce a strictly increasing sequence', () => {
    const a = genTraceId()
    const b = genTraceId()
    expect(b).toBe(a + 1)

    const s1 = genSpanId()
    const s2 = genSpanId()
    expect(s2).toBe(s1 + 1)
  })
})

describe('getTimestamp', () => {
  it('wraps the input to fit within 10,000,000', () => {
    expect(getTimestamp(12345678)).toBe(12345678 % 10000000)
    expect(getTimestamp(5)).toBe(5)
  })
})

describe('MessageBuilder buildBin/readBin round trip', () => {
  let builder

  beforeEach(() => {
    builder = new MessageBuilder({ appId: 7, appDevicePort: 20, appSidePort: 3 })
  })

  it('encodes and decodes a data frame losslessly', () => {
    const payload = Buffer.from('hello')
    const bin = builder.buildBin({
      flag: MessageFlag.App,
      version: MessageVersion.Version1,
      type: MessageType.Data,
      port1: 20,
      port2: 3,
      appId: 7,
      extra: 0,
      payload,
    })

    const decoded = builder.readBin(bin)
    expect(decoded.flag).toBe(MessageFlag.App)
    expect(decoded.version).toBe(MessageVersion.Version1)
    expect(decoded.type).toBe(MessageType.Data)
    expect(decoded.port1).toBe(20)
    expect(decoded.port2).toBe(3)
    expect(decoded.appId).toBe(7)
    expect(Buffer.from(decoded.payload).toString()).toBe('hello')
  })

  it('throws when the payload exceeds the max chunk size', () => {
    const oversized = Buffer.alloc(builder.chunkSize + 1)
    expect(() =>
      builder.buildBin({
        flag: MessageFlag.App,
        version: MessageVersion.Version1,
        type: MessageType.Data,
        port1: 20,
        port2: 3,
        appId: 7,
        extra: 0,
        payload: oversized,
      })
    ).toThrow()
  })
})

describe('MessageBuilder buildPayload/readPayload round trip', () => {
  let builder

  beforeEach(() => {
    builder = new MessageBuilder({ appId: 1 })
  })

  it('encodes and decodes the HM protocol header losslessly', () => {
    const payload = Buffer.from(JSON.stringify({ hello: 'world' }))
    const built = builder.buildPayload({
      traceId: 12345,
      spanId: 42,
      seqId: 1,
      totalLength: payload.byteLength,
      type: MessagePayloadOpCode.Finished,
      opCode: MessagePayloadOpCode.Finished,
      payload,
      contentType: MessagePayloadDataTypeOp.JSON,
      dataType: MessagePayloadDataTypeOp.JSON,
    })

    const decoded = builder.readPayload(built)
    expect(decoded.traceId).toBe(12345)
    expect(decoded.spanId).toBe(42)
    expect(decoded.seqId).toBe(1)
    expect(decoded.totalLength).toBe(payload.byteLength)
    expect(decoded.payloadLength).toBe(payload.byteLength)
    expect(decoded.contentType).toBe(MessagePayloadDataTypeOp.JSON)
    expect(decoded.dataType).toBe(MessagePayloadDataTypeOp.JSON)
    expect(Buffer.from(decoded.payload).toString()).toBe(payload.toString())
  })
})

describe('MessageBuilder sendJson -> onMessage -> emitted request', () => {
  it('reassembles a single-chunk JSON request and emits it', () => {
    const sent = []
    const builder = new MessageBuilder({ appId: 1 })
    builder.sendMsg = (buf) => sent.push(buf)

    let received
    builder.on('request', (ctx) => {
      received = builder.buf2Json(ctx.request.payload)
    })

    builder.sendJson({ requestId: 999, json: { method: 'SYNC' } })
    expect(sent).toHaveLength(1)

    builder.onMessage(sent[0])

    expect(received).toEqual({ method: 'SYNC' })
  })
})
