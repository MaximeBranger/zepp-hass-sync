import { align, text_style } from '@zos/ui'
import { px } from '@zos/utils'

const CENTERED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.CENTER_V,
  text_style: text_style.NONE,
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

export const INTERVAL_MINUS_BUTTON_STYLE = {
  x: px(60),
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
  x: px(140),
  y: px(202),
  w: px(200),
  h: px(60),
  color: 0xffffff,
  text_size: px(22),
}

export const INTERVAL_PLUS_BUTTON_STYLE = {
  x: px(350),
  y: px(202),
  w: px(70),
  h: px(60),
  radius: px(12),
  normal_color: 0x3a3a3a,
  press_color: 0x1a1a1a,
  text: '+',
}

export const SYNC_BUTTON_STYLE = {
  x: px(90),
  y: px(340),
  w: px(300),
  h: px(60),
  radius: px(12),
  normal_color: 0x3a7afe,
  press_color: 0x1a4fc4,
  text: 'Sync now',
}

// Diagnostic line: pending alarm count + the type localStorage round-trips numbers as. Rendered on
// screen rather than logged because the Zepp app's log viewer only streams while the mini-program
// is in the foreground, which is not when background behaviour is interesting.
export const DIAGNOSTIC_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(20),
  y: px(410),
  w: px(440),
  h: px(26),
  color: 0x777777,
  text_size: px(16),
}
