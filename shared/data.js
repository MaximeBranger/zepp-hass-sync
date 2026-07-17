export function json2buf(json) {
  return str2buf(json2str(json))
}

export function buf2json(buf) {
  return str2json(buf2str(buf))
}

export function str2json(str) {
  return JSON.parse(str)
}

export function json2str(json) {
  return JSON.stringify(json)
}

export function str2buf(str) {
  return Buffer.from(str, 'utf-8')
}

export function buf2str(buf) {
  return buf.toString('utf-8')
}

export function bin2buf(bin) {
  return Buffer.from(bin)
}

export function buf2hex(buf) {
  return buf.toString('hex')
}

export function bin2hex(bin) {
  return buf2hex(bin2buf(bin))
}
