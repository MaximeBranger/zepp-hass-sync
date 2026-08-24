// First import of both app.js and app-service/index.js, so anything that throws here takes down
// the entry point before a single line of app code runs — presenting as "the service starts but
// never does anything", with no error attributable to any of our own logic.
//
// Zepp OS runs a more restricted JS VM for App Service than for pages, so the two entry points do
// not necessarily agree on which globals exist. Everything here therefore degrades instead of
// throwing: a page that works and a background service that silently never loads is exactly the
// failure this file has to avoid causing.
import './es6-promise'

try {
  if (typeof ES6Promise !== 'undefined' && ES6Promise.polyfill) {
    ES6Promise.polyfill()
  }
} catch {
  // Platform Promise stays in place. Worse than the polyfill, but the module still loads.
}

try {
  if (typeof Promise !== 'undefined' && Promise._setScheduler) {
    // Flush synchronously. The polyfill's default scheduler is built on setTimeout, which Zepp OS
    // documents as unavailable in App Service context — an async scheduler that never fires would
    // leave every promise callback permanently queued.
    Promise._setScheduler(function (flush) {
      flush && flush()
    })
  }
} catch {
  // Default scheduler stays in place.
}
