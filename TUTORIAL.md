# Tutorial: install and configure zepp-hass-sync

This walks through getting zepp-hass-sync running end to end: the Home
Assistant side (zepp2hass), installing the watch app, and configuring the
webhook and sync interval. See [Compatible Devices](README.md#compatible-devices)
for which watches this has actually been tested on before you start.

## 1. Set up zepp2hass in Home Assistant

zepp-hass-sync only sends data — it needs
[zepp2hass](https://github.com/davidepalleschi/zepp2hass) installed in Home
Assistant to receive it.

1. Install the integration, preferably via [HACS](https://hacs.xyz/):
   search for "Zepp2Hass" in HACS and download it, then restart Home
   Assistant. (Manual install: drop the integration into
   `custom_components/zepp2hass` and restart.)
2. In Home Assistant go to **Settings → Devices & Services → Add
   Integration**, search for **Zepp2Hass**, and give it a device name (e.g.
   "My Zepp Watch").
3. Open the newly created device (**Settings → Devices & Services →
   Zepp2Hass → your device name**) and use the **Visit** link under Device
   Info to open its web page, then copy the webhook URL shown there. It
   looks like:

   ```
   http://YOUR_HOME_ASSISTANT_BASE_URL/api/webhook/WEBHOOK_ID
   ```

   Keep this URL — you'll paste it into the watch app's settings in step 3.

## 2. Install zepp-hass-sync on the watch

zepp-hass-sync isn't published on the Zepp App Store, so it's installed as a
developer preview build from source rather than downloaded like a normal
app.

### Prerequisites

- [Node.js](https://nodejs.org/) >= 14
- The [Zepp app](https://www.zepp.com/) on your phone, with your watch
  already paired
- The Zeus CLI:

  ```bash
  npm i @zeppos/zeus-cli -g
  ```

### Enable Developer Mode in the Zepp app

1. Open the Zepp app → **Profile → Settings → About**.
2. Tap the Zepp logo 7 times in a row until a "Developer Mode enabled"
   pop-up appears.

### Build and push the app to your watch

1. Clone this repo and install dependencies:

   ```bash
   git clone https://github.com/<owner>/zepp-hass-sync.git
   cd zepp-hass-sync
   npm install
   ```

2. Log in to your Zepp developer account:

   ```bash
   zeus login
   ```

3. Start a device preview:

   ```bash
   zeus preview
   ```

   This compiles the app and prints a QR code in the terminal.

4. In the Zepp app, open **Profile → Mini Program → "+" → Scan**, and scan
   the QR code from step 3. The app installs directly onto your paired
   watch.

You can re-run `zeus preview` any time you change the code to push an
updated build the same way.

## 3. Configure the app

1. In the Zepp app, open the "Hass Sync" app's settings page (**Profile →
   your watch → App list → Hass Sync → Settings**, or via the mini program
   entry created in step 2.4).
2. Paste the webhook URL you copied from Home Assistant in step 1.3 into
   the **Webhook URL** field.
3. Set the **Sync interval** (in minutes) — this controls how often the
   watch syncs automatically in the background. It can also be adjusted
   later from the watch face itself using the +/- buttons; both stay in
   sync.
4. On the watch, open the Hass Sync app and tap **Sync** to trigger a
   manual sync. The watch face shows the outcome ("OK", "Failed: …", or
   "Webhook not configured") and the timestamp of the last attempt — check
   this to confirm the webhook URL is correct.
5. From then on, the watch syncs automatically every N minutes in the
   background, in addition to manual syncs.

## Troubleshooting

- **"Webhook not configured"** — the Webhook URL field in the app's phone
  Settings is empty; go back to step 3.2.
- **"Failed: webhook responded with status …"** — the URL is reachable but
  Home Assistant rejected the request; re-copy the webhook URL from the
  zepp2hass device page, it may have changed.
- **"Failed: BLE request failed…" / no response** — the phone couldn't
  reach the watch over Bluetooth; make sure the Zepp app is running and the
  watch is connected.
- **QR code scan fails / app doesn't install** — confirm Developer Mode is
  still enabled (Zepp app → Profile → Settings) and that `zeus preview` is
  still running when you scan.
