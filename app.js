import './shared/device-polyfill'
import { log as Logger } from '@zos/utils'

const logger = Logger.getLogger('hass-sync-app')

App({
  // Nothing here may throw. An uncaught error out of onCreate is not contained to the failing
  // step — the OS retries launching the app, which on a device where the failure is deterministic
  // becomes a relaunch loop.
  //
  // Starting the background app-service deliberately does NOT happen here — page/index.js's
  // build() does it, via shared/service-boot.js. The permission it needs is requested with a
  // user-facing dialog, and raising one from onCreate() means raising it before any page exists to
  // host it; the page is also the only context that can display the outcome. See service-boot.js.
  //
  // There is deliberately no BLE connection held here either. `@zos/ble` represents a single
  // physical connection to the phone shared by the whole app, not one that can be split between
  // multiple independent MessageBuilder instances — a persistent one here, held for the app's
  // entire open duration, and the transient one app-service/index.js's long-running service opens
  // and closes every tick, then fight over that one connection's handshake state. That's what
  // turned "Sync now" into an indefinite hang on "sending...": the service could tear down or
  // re-handshake the shared connection out from under a request this page had already started.
  // page/index.js now opens its own short-lived MessageBuilder per tap instead, the same transient
  // pattern the service already uses — see its runSync() and requestIntervalChange().
  onCreate() {
    logger.log('app onCreate invoked')
  },

  onDestroy() {
    logger.log('app onDestroy invoked')
  },
})
