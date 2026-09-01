import { align, text_style } from '@zos/ui'
import { px } from '@zos/utils'

// Square-shape counterpart of index.r.layout.js — same widgets, positions adapted to a
// 390-wide rectangular canvas (GTS 4, Bip 5/6/Max, Rome, Cheetah Square, ...) instead of
// the round 480 design bucket. Values are set at runtime by page/index.js; see that file.

const CENTERED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.CENTER_V,
  text_style: text_style.NONE,
}

// See index.r.layout.js: the diagnostics wrap rather than clipping whatever doesn't fit on one line.
const WRAPPED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.TOP,
  text_style: text_style.WRAP,
}

export const TITLE_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(0),
  y: px(58),
  w: px(390),
  h: px(36),
  color: 0xffffff,
  text_size: px(26),
  text: 'Hass Sync',
}

// Color is set at runtime (page/index.js) depending on the sync outcome.
export const STATUS_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(15),
  y: px(102),
  w: px(360),
  h: px(36),
  text_size: px(24),
}

export const LAST_SYNC_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(15),
  y: px(144),
  w: px(360),
  h: px(28),
  color: 0x999999,
  text_size: px(18),
}

// Read-only — the interval belongs to the phone. See index.r.layout.js.
export const INTERVAL_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(15),
  y: px(180),
  w: px(360),
  h: px(32),
  color: 0xffffff,
  text_size: px(22),
}

export const REFRESH_BUTTON_STYLE = {
  x: px(45),
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
  x: px(45),
  y: px(286),
  w: px(300),
  h: px(60),
  radius: px(12),
  normal_color: 0x3a7afe,
  press_color: 0x1a4fc4,
  text: 'Sync now',
}

// Doubles as the background-sync status line, and hides itself once the worker is running — see
// index.r.layout.js.
export const BG_BUTTON_STYLE = {
  x: px(15),
  y: px(356),
  w: px(360),
  h: px(52),
  radius: px(12),
  normal_color: 0x8a5a00,
  press_color: 0x5a3b00,
  text_size: px(20),
  text: 'Enable background sync',
}

// Diagnostic blocks — see index.r.layout.js for why these are on screen rather than in a log, and
// why they wrap onto several lines instead of being clipped. A rectangular canvas keeps its full
// width all the way down, so the only reason these run past the bottom edge is length; the page's
// free-scroll mode brings them into view.
export const BOOT_DIAGNOSTIC_TEXT_STYLE = {
  ...WRAPPED_TEXT,
  x: px(15),
  y: px(424),
  w: px(360),
  h: px(66),
  color: 0x777777,
  text_size: px(18),
}

export const DIAGNOSTIC_TEXT_STYLE = {
  ...WRAPPED_TEXT,
  x: px(15),
  y: px(500),
  w: px(360),
  h: px(88),
  color: 0x777777,
  text_size: px(18),
}
