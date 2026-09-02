import { gettext } from 'i18n'
import { formatDateTime } from '../shared/format-time'
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  INTERVAL_STEP_MINUTES,
  SERVICE_STAGE_OK,
  SETTINGS_KEY_BG_SYNC_COUNT,
  SETTINGS_KEY_INTERVAL_MINUTES,
  SETTINGS_KEY_LAST_BG_SYNC_TIME,
  SETTINGS_KEY_LAST_SERVICE_HELLO,
  SETTINGS_KEY_LAST_SYNC_ERROR,
  SETTINGS_KEY_LAST_SYNC_OK,
  SETTINGS_KEY_LAST_SYNC_TIME,
  SETTINGS_KEY_SERVICE_DETAIL,
  SETTINGS_KEY_SERVICE_STAGE,
  SETTINGS_KEY_WEBHOOK_URL,
  clampIntervalMinutes,
} from '../shared/constants'

const STATUS_COLOR_OK = '#3ac569'
const STATUS_COLOR_FAILED = '#e5533d'
const STATUS_COLOR_NEVER = '#8a8a8a'

// The settings page renders inside the Zepp app's webview, so styling is plain inline CSS objects —
// no stylesheet, no media queries. Everything below is sized for a phone held one-handed: generous
// touch targets, one card per idea, and no horizontal scroll.
const COLOR_BG = '#f2f3f5'
const COLOR_CARD = '#ffffff'
const COLOR_TEXT = '#1c1d21'
const COLOR_MUTED = '#75777f'
const COLOR_BORDER = '#e4e6ea'
const COLOR_ACCENT = '#2f6fed'

const styles = {
  page: {
    padding: '16px 14px 32px',
    background: COLOR_BG,
    minHeight: '100%',
    boxSizing: 'border-box',
    fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
    color: COLOR_TEXT,
  },
  hero: {
    padding: '4px 6px 18px',
  },
  heroTitle: {
    fontSize: '22px',
    fontWeight: '700',
    lineHeight: '1.25',
    margin: '0',
  },
  heroSubtitle: {
    fontSize: '13px',
    color: COLOR_MUTED,
    lineHeight: '1.45',
    marginTop: '6px',
  },
  card: {
    background: COLOR_CARD,
    borderRadius: '14px',
    border: `1px solid ${COLOR_BORDER}`,
    padding: '16px 16px 6px',
    marginBottom: '14px',
    boxShadow: '0 1px 2px rgba(16, 18, 25, 0.05)',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: '600',
    margin: '0',
  },
  cardDescription: {
    fontSize: '12px',
    color: COLOR_MUTED,
    lineHeight: '1.45',
    margin: '4px 0 12px',
  },
  intervalValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: COLOR_ACCENT,
    lineHeight: '1.1',
    marginBottom: '2px',
  },
  intervalUnit: {
    fontSize: '12px',
    color: COLOR_MUTED,
    marginBottom: '10px',
  },
  debugToggle: {
    width: '100%',
    background: COLOR_CARD,
    color: COLOR_MUTED,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: '14px',
    padding: '14px 16px',
    fontSize: '14px',
    fontWeight: '600',
    textAlign: 'left',
  },
  debugPanel: {
    marginTop: '12px',
    paddingLeft: '4px',
    borderLeft: `2px solid ${COLOR_BORDER}`,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginTop: '5px',
    flexShrink: '0',
  },
  statusText: {
    fontSize: '13px',
    lineHeight: '1.5',
    whiteSpace: 'pre-line',
    wordBreak: 'break-word',
    flex: '1',
  },
}

function buildStatus(settingsStorage) {
  const lastSyncTime = parseInt(settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_TIME), 10)
  if (!lastSyncTime) {
    return { text: gettext('statusNeverSynced'), color: STATUS_COLOR_NEVER }
  }

  const when = formatDateTime(lastSyncTime)
  const ok = settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_OK) === 'true'
  if (ok) {
    return { text: `${gettext('statusOk')} — ${when}`, color: STATUS_COLOR_OK }
  }

  const error = settingsStorage.getItem(SETTINGS_KEY_LAST_SYNC_ERROR) || ''
  return { text: `${gettext('statusFailed')}: ${error} (${when})`, color: STATUS_COLOR_FAILED }
}

// The background service's own state. This lives here rather than on the watch because the service
// cannot write watch-side storage at all (see app-service/index.js) — it reports over Bluetooth, and
// the phone is what keeps the record. This screen is also the only surface with room for the full
// error text; the watch face shows just the stage name.
function buildServiceStatus(settingsStorage) {
  const helloTime = parseInt(settingsStorage.getItem(SETTINGS_KEY_LAST_SERVICE_HELLO), 10)
  if (!helloTime) {
    return { text: gettext('serviceNeverStarted'), color: STATUS_COLOR_NEVER }
  }

  const count = parseInt(settingsStorage.getItem(SETTINGS_KEY_BG_SYNC_COUNT), 10) || 0
  const lastTime = parseInt(settingsStorage.getItem(SETTINGS_KEY_LAST_BG_SYNC_TIME), 10)
  const stage = settingsStorage.getItem(SETTINGS_KEY_SERVICE_STAGE) || ''
  const detail = settingsStorage.getItem(SETTINGS_KEY_SERVICE_DETAIL) || ''

  const started = `${gettext('serviceStarted')}: ${formatDateTime(helloTime)}`
  const delivered = lastTime
    ? `${gettext('serviceDelivered')}: ${count} (${formatDateTime(lastTime)})`
    : gettext('serviceDeliveredNone')
  // A stage that isn't `ok` is why nothing is arriving, so it leads and carries its error text.
  if (stage && stage !== SERVICE_STAGE_OK) {
    const suffix = detail ? ` — ${detail}` : ''
    return {
      text: `${gettext('serviceStuckAt')} "${stage}"${suffix}\n${started}\n${delivered}`,
      color: STATUS_COLOR_FAILED,
    }
  }

  return { text: `${started}\n${delivered}`, color: count ? STATUS_COLOR_OK : STATUS_COLOR_NEVER }
}

// A card is just a titled View — Section's own chrome is not stylable, so we draw our own.
function Card(title, description, children) {
  const header = [Text({ style: styles.cardTitle }, title)]
  if (description) {
    header.push(Text({ style: styles.cardDescription }, description))
  }
  return View({ style: styles.card }, header.concat(children))
}

// Coloured dot + text, used for both status readouts in the debug panel.
function StatusLine(status) {
  return View({ style: styles.statusRow }, [
    View({ style: Object.assign({}, styles.statusDot, { background: status.color }) }),
    Text({ style: Object.assign({}, styles.statusText, { color: status.color }) }, status.text),
  ])
}

AppSettingsPage({
  state: {
    props: {},
    showDebug: false,
  },

  setWebhookUrl(value) {
    this.state.props.settingsStorage.setItem(SETTINGS_KEY_WEBHOOK_URL, value)
  },

  setIntervalMinutes(value) {
    const minutes = clampIntervalMinutes(value)
    this.state.props.settingsStorage.setItem(SETTINGS_KEY_INTERVAL_MINUTES, String(minutes))
  },

  toggleDebug() {
    this.setState({ showDebug: !this.state.showDebug })
  },

  // Everything the user never needs on a good day: the last-sync readout and the background
  // service's own report. Collapsed by default so the two settings above stay the whole screen.
  buildDebugPanel(settingsStorage) {
    const status = buildStatus(settingsStorage)
    const serviceStatus = buildServiceStatus(settingsStorage)

    return View({ style: styles.debugPanel }, [
      Card(gettext('statusSectionTitle'), '', [
        View({ style: { paddingBottom: '10px' } }, [StatusLine(status)]),
      ]),
      Card(gettext('serviceSectionTitle'), gettext('serviceSectionDescription'), [
        View({ style: { paddingBottom: '10px' } }, [StatusLine(serviceStatus)]),
      ]),
    ])
  },

  build(props) {
    this.state.props = props
    const settingsStorage = props.settingsStorage
    const webhookUrl = settingsStorage.getItem(SETTINGS_KEY_WEBHOOK_URL) || ''
    const intervalMinutes = clampIntervalMinutes(settingsStorage.getItem(SETTINGS_KEY_INTERVAL_MINUTES))
    const showDebug = this.state.showDebug

    const children = [
      View({ style: styles.hero }, [
        Text({ style: styles.heroTitle }, gettext('appTitle')),
        Text({ style: styles.heroSubtitle }, gettext('appSubtitle')),
      ]),

      Card(gettext('webhookSectionTitle'), gettext('webhookSectionDescription'), [
        TextInput({
          label: gettext('webhookUrlLabel'),
          placeholder: gettext('webhookUrlPlaceholder'),
          value: webhookUrl,
          onChange: (value) => this.setWebhookUrl(value),
        }),
      ]),

      Card(gettext('intervalSectionTitle'), gettext('intervalSectionDescription'), [
        Text({ style: styles.intervalValue }, String(intervalMinutes)),
        Text({ style: styles.intervalUnit }, gettext('intervalUnit')),
        Slider({
          min: MIN_INTERVAL_MINUTES,
          max: MAX_INTERVAL_MINUTES,
          step: INTERVAL_STEP_MINUTES,
          value: intervalMinutes,
          onChange: (value) => this.setIntervalMinutes(value),
        }),
      ]),

      Button({
        label: `${showDebug ? '▾' : '▸'}  ${gettext('debugSectionTitle')}`,
        style: styles.debugToggle,
        onClick: () => this.toggleDebug(),
      }),
    ]

    if (showDebug) {
      children.push(this.buildDebugPanel(settingsStorage))
    }

    return View({ style: styles.page }, children)
  },
})
