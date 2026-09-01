import { align, text_style } from '@zos/ui'
import { px } from '@zos/utils'

const CENTERED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.CENTER_V,
  text_style: text_style.NONE,
}

// For the diagnostics, which are long, dense, and must never be cut off. `text_style.NONE` keeps
// text on one line and silently clips whatever doesn't fit — on this round display that meant the
// last field of a line vanished behind the bezel, which is how `t:` became unreadable on a real
// watch. WRAP breaks at spaces instead, and the fields are written so each break lands between them.
// `align_v: TOP` so a block that grows to two lines grows downwards rather than recentring.
const WRAPPED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.TOP,
  text_style: text_style.WRAP,
}

export const TITLE_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(0),
  y: px(58),
  w: px(480),
  h: px(36),
  color: 0xffffff,
  text_size: px(26),
  text: 'Hass Sync',
}

// Color is set at runtime (page/index.js) depending on the sync outcome.
export const STATUS_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(20),
  y: px(102),
  w: px(440),
  h: px(36),
  text_size: px(24),
}

export const LAST_SYNC_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(20),
  y: px(144),
  w: px(440),
  h: px(28),
  color: 0x999999,
  text_size: px(18),
}

// Read-only. The interval is the phone's to set — this only reports what the last pull returned, so
// there is no stepper beside it any more. Full width, since nothing shares its row now.
export const INTERVAL_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(40),
  y: px(180),
  w: px(400),
  h: px(32),
  color: 0xffffff,
  text_size: px(22),
}

// Pulls the phone's config. Grey rather than blue: it is the supporting action, next to Sync which
// is the one that actually moves data.
export const REFRESH_BUTTON_STYLE = {
  x: px(90),
  y: px(222),
  w: px(300),
  h: px(54),
  radius: px(12),
  normal_color: 0x3a3a3a,
  press_color: 0x1a1a1a,
  text_size: px(20),
  text: 'Refresh config',
}

export const SYNC_BUTTON_STYLE = {
  x: px(90),
  y: px(286),
  w: px(300),
  h: px(60),
  radius: px(12),
  normal_color: 0x3a7afe,
  press_color: 0x1a4fc4,
  text: 'Sync now',
}

// The background-sync control. It doubles as the status line for whatever is currently blocking the
// worker — no config yet, no webhook, permission missing, permission granted but not in effect — and
// hides itself once the worker is running, because at that point it has nothing left to offer.
// Amber so it reads as "something needs your attention" beside the primary Sync action.
//
// It is created unconditionally and toggled with prop.VISIBLE rather than created on demand: every
// blocking state can be entered *after* build() has run (the config pull failing, the OS evicting
// the service, a webhook cleared on the phone), so the widget has to already exist for the next
// render to bring it back.
export const BG_BUTTON_STYLE = {
  x: px(60),
  y: px(356),
  w: px(360),
  h: px(52),
  radius: px(12),
  normal_color: 0x8a5a00,
  press_color: 0x5a3b00,
  text_size: px(20),
  text: 'Enable background sync',
}

// The two diagnostic blocks, stacked below the Sync button: how far starting the background service
// got, and what it has done since. Rendered on screen rather than logged because the Zepp app's log
// viewer only streams while the mini-program is in the foreground, which is not when background
// behaviour is interesting. See page/index.js's renderDiagnostics().
//
// They extend past the bottom of the display on purpose. Squeezing both onto single lines above
// y:480 is what made them unreadable: a round screen's usable width collapses towards the bottom
// (about 290px at y:430, 210px at y:456), so a line long enough to be useful had its ends clipped by
// the bezel with no indication anything was missing. So they wrap instead, and page/index.js puts
// the page in free-scroll mode — scrolling brings each block up into the wide middle of the display,
// where the full width is actually available.
export const BOOT_DIAGNOSTIC_TEXT_STYLE = {
  ...WRAPPED_TEXT,
  x: px(40),
  y: px(424),
  w: px(400),
  h: px(66),
  color: 0x777777,
  text_size: px(18),
}

export const DIAGNOSTIC_TEXT_STYLE = {
  ...WRAPPED_TEXT,
  x: px(40),
  y: px(500),
  w: px(400),
  h: px(88),
  color: 0x777777,
  text_size: px(18),
}
