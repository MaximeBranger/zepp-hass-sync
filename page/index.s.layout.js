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

export const INTERVAL_MINUS_BUTTON_STYLE = {
  x: px(20),
  y: px(202),
  w: px(70),
  h: px(60),
  radius: px(12),
  normal_color: 0x3a3a3a,
  press_color: 0x1a1a1a,
  text: '-',
}

export const INTERVAL_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(100),
  y: px(202),
  w: px(190),
  h: px(60),
  color: 0xffffff,
  text_size: px(22),
}

export const INTERVAL_PLUS_BUTTON_STYLE = {
  x: px(300),
  y: px(202),
  w: px(70),
  h: px(60),
  radius: px(12),
  normal_color: 0x3a3a3a,
  press_color: 0x1a1a1a,
  text: '+',
}

export const SYNC_BUTTON_STYLE = {
  x: px(45),
  y: px(340),
  w: px(300),
  h: px(60),
  radius: px(12),
  normal_color: 0x3a7afe,
  press_color: 0x1a4fc4,
  text: 'Sync now',
}

// Diagnostic line — see index.r.layout.js for why this is on screen rather than in a log.
export const DIAGNOSTIC_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(15),
  y: px(410),
  w: px(360),
  h: px(26),
  color: 0x777777,
  text_size: px(16),
}
