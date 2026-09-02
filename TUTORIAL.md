# Tutorial: install and configure zepp-hass-sync

This walks through getting zepp-hass-sync running end to end: the Home
Assistant side (zepp2hass), installing the watch app, and configuring the
webhook and send interval. See [Compatible Devices](README.md#compatible-devices)
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
3. Set the **Send interval** (in minutes) — this controls how often the watch
   sends its data on its own. The phone is the only place either setting is
   edited; the watch reads them and never writes them back.
4. On the watch, open the Hass Sync app. On the very first launch it asks for
   the background-execution permission by itself — accept it. Automatic sending
   cannot start without it; the **Send now** button still works, but nothing
   will happen while the app is closed.

   The app asks only once. If you decline, or dismiss the dialog, nothing is
   lost: the **Enable auto send** button at the bottom of the screen raises it
   again whenever you want. Once automatic sending is running the button
   disappears — if you ever see it come back, something has stopped it, and its
   label says what.

   The button may briefly read **"Starting…"**, and then possibly
   **"Granted — tap to restart"**. That is normal on some watches: the
   permission you just granted doesn't take effect for the app that's already
   running. Tapping the button closes the app; open it again and automatic
   sending will be on.
5. Tap the big **Send now** button to send immediately. Under it, a coloured dot
   and the time of the last send: **green** it went through, **red** it failed,
   **amber** no webhook is set yet, **grey** nothing has been sent. When
   something went wrong, a smaller grey line underneath says what — and stays
   empty when nothing did. Check this to confirm the webhook URL is correct.
6. Lower down, the watch reports the config it pulled from the phone:
   *"Sending every N min"*. The pull happens automatically every time you open
   the app, so the interval from step 3.3 appears within a second or two.
   **Refresh config** pulls it again on demand — useful right after changing
   something on the phone. It only reads settings; it sends no health data,
   which is why it is a separate, smaller button from Send now.

   If the pull fails, that line says so — *"Config refresh failed"* if the phone
   couldn't be reached, *"Phone sent no config"* if it answered with nothing
   usable. A refresh that succeeds and shows the same
   number means the phone really is still on that value: settings changed in the
   Zepp app can take a moment to reach the watch, so give it a few seconds and
   tap again.

   Until that first pull succeeds the watch shows *"Config not loaded yet"* and
   deliberately starts nothing automatic: it has no idea what pace you want, and
   guessing would mean sending at the wrong rate. The same applies while no
   webhook URL is set — the button then reads **"Set webhook on phone"**.
7. From then on, the watch sends automatically every N minutes, in addition to
   whatever you send by hand. A system alarm is the clock: it wakes the
   background service, which arms the next alarm, sends once, and ends itself.
   Nothing stays running in between, so nothing can quietly die in between
   either. The alarms survive a reboot, and opening the app re-arms them, so if
   automatic sending ever stops, opening the app once restores it.

   The dot and time on the watch reflects automatic sends too, not just
   the ones you trigger. The watch can't observe them directly — the background
   service has no access to the watch's own storage — so the phone reports the
   outcome back on the next exchange, which the automatic config pull on every
   app open takes care of.

## A note on the two words

This app does two different things over Bluetooth, and never calls them the
same name:

- **Send** — your health data going out to Home Assistant. The big button, the
  automatic runs, and the interval that paces them.
- **Config** — the watch reading `{ interval, is a webhook set }` back from the
  phone. One direction, no health data, cheap.

Both used to be called "sync", which made the watch face ambiguous: "Sync now"
read as though it might go and fetch settings. If you are coming from an older
build, that is the rename you are seeing.

## Troubleshooting

Everything below is read from the watch face, except where it says otherwise.
The deeper diagnostics live in the Zepp app now — see **The Debug panel**.

- **Amber dot, "Webhook not set"** — the Webhook URL field in the app's phone Settings is
  empty; go back to step 3.2, then tap **Refresh config**.
- **Red dot, "webhook responded with status …"** — the URL is
  reachable but Home Assistant rejected the request; re-copy the webhook URL
  from the zepp2hass device page, it may have changed.
- **Red dot, "BLE request failed…"** — the phone couldn't be reached
  over Bluetooth; make sure the Zepp app is running and the watch is connected.
- **"Config not loaded yet"** — the watch has never managed to reach the phone,
  so it doesn't know your interval and starts nothing automatic. Tap **Refresh
  config** with the phone nearby and Bluetooth on.
- **"Enable auto send" keeps coming back** — its label names the reason.
  *"Waiting for phone…"* is the config gate above; *"Set webhook on phone"* is
  step 3.2; *"Granted — tap to restart"* means the permission is granted but not
  in effect for the running app, and tapping closes it so you can reopen.
- **Automatic sends stop while the phone is asleep** — the watch sends
  regardless, but the Zepp app on the phone has to be alive to forward anything
  to Home Assistant. Phone power management is outside this app's control; if
  sends resume when you wake the phone, that is what you are seeing, and
  exempting the Zepp app from battery optimisation is the fix.
- **QR code scan fails / app doesn't install** — confirm Developer Mode is
  still enabled (Zepp app → Profile → Settings) and that `zeus preview` is
  still running when you scan.

### The Debug panel

**Send now works but nothing arrives on its own.** The watch face deliberately
carries no diagnostics — it is one action and its result. Open the app's
Settings in the Zepp app and turn on **Debug** at the bottom. Two readouts
appear:

| Readout | What it tells you |
| --- | --- |
| **Last send** | The outcome and time of the last send the *phone* handled, from either source. This is the authoritative record — the phone is the side that actually calls the webhook — and it carries the full, untruncated error text, which the watch face has no room for |
| **Automatic sending** | *Started* is when the background service last made contact at all. *Sends received* counts what it has delivered, with the time of the most recent |

Reading them:

- **Never started** — the background service has never run. Nothing on the watch
  can be misconfigured to cause this; it is a platform-level failure to launch
  it. Re-open the watch app, which re-arms the alarm that wakes it.
- **Started, but "No sends received yet"** — the service runs and reaches the
  phone, and its send fails. The panel names the stage it got stuck at
  (*"Stuck at stage"*) with the error beside it.
- **Sends received climbing** — working. Leave the watch alone for one full
  interval and check the count has gone up; opening the app also produces a
  send, so compare timestamps rather than the count alone.
- **Sends received frozen while manual sends work** — the service only ever runs
  when you open the app; the alarm is not waking it. Re-open the app to re-arm,
  and if it stays frozen across several intervals, the alarm is not firing on
  that firmware.
