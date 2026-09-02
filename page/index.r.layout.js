import { align, text_style } from '@zos/ui'
import { px } from '@zos/utils'

// Round 480 design bucket (GTR 4, Balance, Cheetah Round, ...).
//
// The screen has one job and says so: the big blue button sends this watch's health data to Home
// Assistant, and the two lines under it report how the last send went. Everything to do with the
// *config* — the interval pulled from the phone, and the button that re-pulls it — sits below that,
// deliberately smaller, because it is a supporting action nobody opens the app to perform. The two
// were previously the same size and both called "sync", which is exactly the confusion this layout
// exists to end; see shared/constants.js's header on the send/config split.
//
// Everything fits above y:480. Nothing scrolls, and nothing is placed where the round bezel would
// clip it — the usable chord narrows fast towards the bottom (about 320px at y:394), which is why
// the lower elements are inset further than the upper ones.

const CENTERED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.CENTER_V,
  text_style: text_style.NONE,
}

// For the send detail line, which carries error text of unpredictable length. `text_style.NONE`
// keeps text on one line and silently clips the overflow behind the bezel; WRAP breaks at spaces
// instead. `align_v: TOP` so a second line grows downwards rather than recentring the first.
const WRAPPED_TEXT = {
  align_h: align.CENTER_H,
  align_v: align.TOP,
  text_style: text_style.WRAP,
}

export const TITLE_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(0),
  y: px(46),
  w: px(480),
  h: px(34),
  color: 0xffffff,
  text_size: px(26),
  text: 'Hass Sync',
}

// The one action worth opening the app for: read the sensors now and push them to Home Assistant.
// Sized and coloured to be unmistakably the primary control — everything else on screen is smaller,
// greyer, or both.
export const SEND_BUTTON_STYLE = {
  x: px(60),
  y: px(96),
  w: px(360),
  h: px(100),
  radius: px(50),
  normal_color: 0x3a7afe,
  press_color: 0x1a4fc4,
  text_size: px(30),
  // Overridden by getText('sendNow') at creation — see page/index.js's build().
  text: 'Send now',
}

// The verdict of the last send, as a coloured dot beside the timestamp rather than a word. Colour
// is the whole message here, so it is set at runtime (page/index.js) — green sent, red failed,
// amber no webhook, grey nothing yet.
//
// Its position is fixed rather than following the text, which works because the timestamp beside it
// is fixed-width (`DD/MM HH:MM`): the dot and that string together sit centred on the display. The
// two states that show a message instead of a time are longer and run to the right of centre, which
// is the right trade — they are the states you read once and fix, not the everyday one.
// A FILL_RECT with a radius of half its side, not a CIRCLE widget: the colour has to change at
// runtime, and a CIRCLE created green-or-grey kept whatever colour it was built with. FILL_RECT
// takes both its colour and its position from setProperty, which this needs on every render.
export const SEND_DOT_STYLE = {
  x: px(0),
  y: px(213),
  w: px(18),
  h: px(18),
  radius: px(9),
}

// When the last send happened, or why there hasn't been one. Left-aligned and positioned at
// runtime: `x` and `w` below are placeholders, and page/index.js's layoutSendRow() replaces them so
// the dot and the text sit centred *as a pair*. Fixing them here was the earlier mistake — it meant
// guessing how wide the string would render, and the guess was wrong.
export const SEND_TIME_TEXT_STYLE = {
  align_h: align.LEFT,
  align_v: align.CENTER_V,
  text_style: text_style.NONE,
  x: px(195),
  y: px(206),
  w: px(260),
  h: px(32),
  color: 0xffffff,
  text_size: px(22),
}

// The gap between the dot and the text, and the widest the pair may grow before it is left to run
// off-centre rather than off-screen.
export const SEND_ROW_GAP = px(10)
export const SEND_ROW_MAX_WIDTH = px(400)

// The error text, when there is one, and nothing at all when there isn't. Wrapped, because an error
// message is as long as it is and truncating it to one line is how the useful half gets lost.
export const SEND_NOTE_TEXT_STYLE = {
  ...WRAPPED_TEXT,
  x: px(40),
  y: px(246),
  w: px(400),
  h: px(54),
  color: 0x999999,
  text_size: px(17),
}

// The config the watch pulled from the phone. Read-only: the phone's Settings screen is the only
// place the interval is edited, so this reports rather than offers.
export const CONFIG_TEXT_STYLE = {
  ...CENTERED_TEXT,
  x: px(40),
  y: px(306),
  w: px(400),
  h: px(26),
  color: 0x999999,
  text_size: px(17),
}

// Forces a fresh config pull. Deliberately small and grey: the app already pulls on every open, so
// this exists for the case where the phone was out of range then and is back now.
export const CONFIG_BUTTON_STYLE = {
  x: px(140),
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

// The background-send control. It doubles as the status line for whatever is currently blocking the
// worker — no config yet, no webhook, permission missing, permission granted but not in effect — and
// hides itself once the worker is running, because at that point it has nothing left to offer.
// Amber so it reads as "something needs your attention" beside the primary Send action.
//
// It is created unconditionally and toggled with prop.VISIBLE rather than created on demand: every
// blocking state can be entered *after* build() has run (the config pull failing, the OS evicting
// the service, a webhook cleared on the phone), so the widget has to already exist for the next
// render to bring it back.
//
// Inset to x:80/w:320 rather than matching the Send button above: at this height the round bezel
// leaves about 320px of usable chord, and the wider box would have its ends clipped.
export const BG_BUTTON_STYLE = {
  x: px(80),
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
