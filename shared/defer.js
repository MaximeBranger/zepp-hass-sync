export function Deferred() {
  const defer = {}

  defer.promise = new Promise(function (resolve, reject) {
    defer.resolve = resolve
    defer.reject = reject
  })

  return defer
}

// Used by MessageBuilder to bound a request. Zepp OS does not provide timer interfaces in App
// Service context, where a bare `setTimeout` reference throws a ReferenceError rather than
// returning undefined — which would escape into the middle of the BLE request path. Degrade to a
// promise that simply never settles: the caller's own deadline (app-service/index.js's
// `withTimeout`) is the outer guard, and a never-settling timeout is inert rather than harmful.
export function timeout(ms, cb) {
  const defer = Deferred()
  ms = ms || 1000

  if (typeof setTimeout !== 'function') {
    return defer.promise
  }

  const wait = setTimeout(() => {
    clearTimeout(wait)

    if (cb) {
      cb && cb(defer.resolve, defer.reject)
    } else {
      defer.reject('Timed out in ' + ms + 'ms.')
    }
  }, ms)

  return defer.promise
}
