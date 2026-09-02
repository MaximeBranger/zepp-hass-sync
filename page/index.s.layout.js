import { align, text_style } from '@zos/ui'
import { px } from '@zos/utils'

// Square-shape counterpart of index.r.layout.js — same widgets and the same vertical rhythm, with
// the horizontal values adapted to a 390-wide rectangular canvas (GTS 4, Bip 5/6/Max, Rome, Cheetah
// Square, ...). See that file for why the screen is arranged this way; values are set at runtime by
// page/index.js.
//
// A rectangular canvas keeps its full width all the way down, so the lower elements are *not* inset
// the way their round counterparts are — the bezel clipping that forces that there does not exist
// here.

const CENTERED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.CENTER_V,
  text_style: text_style.NONE,
}

// See index.r.layout.js: the send detail line wraps rather than clipping the error text.
const WRAPPED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.TOP,
  text_style: text_style.WRAP,
}

export const TITLE_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(0),
  y: px(46),
  w: px(390),
  h: px(34),
  color: 0xffffff,
  text_size: px(26),
  text: 'Hass Sync',
}

export const SEND_BUTTON_STYLE = {
  x: px(45),
  y: px(96),
  w: px(300),
  h: px(100),
  radius: px(50),
  normal_color: 0x3a7afe,
  press_color: 0x1a4fc4,
  text_size: px(30),
  // Overridden by getText('sendNow') at creation — see page/index.js's build().
  text: 'Send now',
}

// Colour set at runtime (page/index.js) depending on how the last send went — see
// index.r.layout.js for why the dot sits at a fixed x rather than following the text.
export const SEND_DOT_STYLE = {
  x: px(0),
  y: px(213),
  w: px(18),
  h: px(18),
  radius: px(9),
}

// `x` and `w` are placeholders — layoutSendRow() centres the dot and this text as a pair at
// runtime. See index.r.layout.js.
export const SEND_TIME_TEXT_STYLE = {
  align_h: align.LEFT,
  align_v: align.CENTER_V,
  text_style: text_style.NONE,
  x: px(150),
  y: px(206),
  w: px(230),
  h: px(32),
  color: 0xffffff,
  text_size: px(22),
}

export const SEND_ROW_GAP = px(10)
export const SEND_ROW_MAX_WIDTH = px(340)

export const SEND_NOTE_TEXT_STYLE = {
  ...WRAPPED_TEXT,
  x: px(15),
  y: px(246),
  w: px(360),
  h: px(54),
  color: 0x999999,
  text_size: px(17),
}

export const CONFIG_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(15),
  y: px(306),
  w: px(360),
  h: px(26),
  color: 0x999999,
  text_size: px(17),
}

export const CONFIG_BUTTON_STYLE = {
  x: px(95),
  y: px(338),
  w: px(200),
  h: px(44),
  radius: px(22),
  normal_color: 0x3a3a3a,
  press_color: 0x1a1a1a,
  text_size: px(17),
  // Overridden by getText('refreshConfig') at creation.
  text: 'Refresh config',
}

// Doubles as the auto-send status line, and hides itself once the worker is running — see
// index.r.layout.js.
export const BG_BUTTON_STYLE = {
  x: px(35),
  y: px(394),
  w: px(320),
  h: px(50),
  radius: px(12),
  normal_color: 0x8a5a00,
  press_color: 0x5a3b00,
  text_size: px(19),
  // Overridden by getText('bgEnable') at creation.
  text: 'Enable auto send',
}
