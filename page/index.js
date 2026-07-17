import { createWidget, widget, prop } from '@zos/ui'
import { log as Logger } from '@zos/utils'
import * as Styles from 'zosLoader:./index.[pf].layout.js'
import { readSensors } from '../app-service/sensors'
import { MESSAGE_METHOD_SYNC } from '../shared/constants'

const logger = Logger.getLogger('hass-sync-page')

Page({
  state: {
    statusText: null,
  },

  build() {
    this.state.statusText = createWidget(widget.TEXT, {
      ...Styles.STATUS_TEXT_STYLE,
      text: 'Tap Sync to send data',
    })

    createWidget(widget.BUTTON, {
      ...Styles.SYNC_BUTTON_STYLE,
      click_func: () => {
        this.state.statusText.setProperty(prop.MORE, { text: 'reading sensors...' })

        let payload
        try {
          payload = readSensors()
        } catch (error) {
          logger.error('readSensors() failed: ' + ((error && error.message) || error))
          this.state.statusText.setProperty(prop.MORE, {
            text: `sensor read failed: ${(error && error.message) || error}`,
          })
          return
        }

        logger.log('sending payload: ' + JSON.stringify(payload))
        this.state.statusText.setProperty(prop.MORE, { text: 'sending...' })

        const messageBuilder = getApp()._options.globalData.messageBuilder
        messageBuilder
          .request({ method: MESSAGE_METHOD_SYNC, payload }, { timeout: 15000 })
          .then((result) => {
            logger.log('got response: ' + JSON.stringify(result))
            this.state.statusText.setProperty(prop.MORE, {
              text: result && result.ok ? `sent! battery=${payload.battery}%` : `failed: ${(result && result.error) || 'unknown error'}`,
            })
          })
          .catch((error) => {
            logger.error('request failed: ' + ((error && error.message) || error))
            this.state.statusText.setProperty(prop.MORE, {
              text: `BLE request failed: ${(error && error.message) || error}`,
            })
          })
      },
    })
  },
})
