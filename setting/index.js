import { gettext } from 'i18n'
import { DEFAULT_INTERVAL_MINUTES, SETTINGS_KEY_INTERVAL_MINUTES, SETTINGS_KEY_WEBHOOK_URL } from '../shared/constants'

AppSettingsPage({
  state: {
    props: {},
  },

  setWebhookUrl(value) {
    this.state.props.settingsStorage.setItem(SETTINGS_KEY_WEBHOOK_URL, value)
  },

  setIntervalMinutes(value) {
    const parsed = parseInt(value, 10)
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MINUTES
    this.state.props.settingsStorage.setItem(SETTINGS_KEY_INTERVAL_MINUTES, String(minutes))
  },

  build(props) {
    this.state.props = props
    const webhookUrl = props.settingsStorage.getItem(SETTINGS_KEY_WEBHOOK_URL) || ''
    const intervalMinutes = props.settingsStorage.getItem(SETTINGS_KEY_INTERVAL_MINUTES) || String(DEFAULT_INTERVAL_MINUTES)

    return View(
      {
        style: {
          padding: '12px 20px',
        },
      },
      [
        View(
          {
            style: {
              marginBottom: '12px',
            },
          },
          [
            TextInput({
              label: gettext('webhookUrlLabel'),
              placeholder: gettext('webhookUrlPlaceholder'),
              value: webhookUrl,
              onChange: (value) => this.setWebhookUrl(value),
            }),
          ],
        ),
        View({}, [
          TextInput({
            label: gettext('intervalLabel'),
            value: intervalMinutes,
            onChange: (value) => this.setIntervalMinutes(value),
          }),
        ]),
      ],
    )
  },
})
