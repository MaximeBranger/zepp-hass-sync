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
3. Set the **Sync interval** (in minutes) — this controls how often the watch
   syncs automatically in the background. The phone is the only place either
   setting is edited; the watch reads them and never writes them back.
4. On the watch, open the Hass Sync app. On the very first launch it asks for
   the background-execution permission by itself — accept it. Background
   syncing cannot start without it; manual syncs still work, but nothing will
   happen while the app is closed.

   The app asks only once. If you decline, or dismiss the dialog, nothing is
   lost: the **Enable background sync** button at the bottom of the screen
   raises it again whenever you want. Once background sync is running the button
   disappears — if you ever see it come back, something has stopped it, and its
   label says what.

   The button may briefly read **"Starting…"**, and then possibly
   **"Granted — tap to restart"**. That is normal on some watches: the
   permission you just granted doesn't take effect for the app that's already
   running. Tapping the button closes the app; open it again and background
   sync will be on.
5. The watch pulls its configuration from the phone automatically each time you
   open the app, so the interval you set in step 3.3 appears under the status
   line within a second or two. **Refresh config** pulls it again on demand —
   useful right after changing something on the phone. It only reads settings;
   it sends no health data.

   If the pull fails, the interval line says so — *"refresh failed"* if the
   phone couldn't be reached, *"phone sent no config"* if it answered with
   nothing usable. A refresh that succeeds and shows the same number means the
   phone really is still on that value: settings changed in the Zepp app can
   take a moment to reach the watch, so give it a few seconds and tap again.

   Until that first pull succeeds the watch shows *"Interval: unknown"* and
   deliberately starts nothing in the background: it has no idea what pace you
   want, and guessing would mean syncing at the wrong rate. The same applies
   while no webhook URL is set — the button then reads **"Set webhook on
   phone"**.
6. Tap **Sync now** to trigger a manual sync. The watch face shows the outcome
   ("OK", "Failed: …", or "Webhook not configured") and the timestamp of the
   last attempt — check this to confirm the webhook URL is correct.
7. From then on, the watch syncs automatically every N minutes in the
   background, in addition to manual syncs. A system alarm is the clock: it wakes
   the background service, which arms the next alarm, sends one sync, and ends
   itself. Nothing stays running between syncs, so nothing can quietly die
   between them either. The alarms survive a reboot, and opening the app re-arms
   them, so if background syncing ever stops, opening the app once restores it.

## Troubleshooting

- **"Webhook not configured"** — the Webhook URL field in the app's phone
  Settings is empty; go back to step 3.2.
- **"Failed: webhook responded with status …"** — the URL is reachable but
  Home Assistant rejected the request; re-copy the webhook URL from the
  zepp2hass device page, it may have changed.
- **"Failed: BLE request failed…" / no response** — the phone couldn't
  reach the watch over Bluetooth; make sure the Zepp app is running and the
  watch is connected.
- **Background syncs stop while the phone is asleep** — the watch sends
  regardless (`wd:` keeps climbing), but the Zepp app on the phone has to be
  alive to forward anything to Home Assistant. Phone power management is outside
  this app's control; if syncs resume when you wake the phone, that is what you
  are seeing, and exempting the Zepp app from battery optimisation is the fix.
- **QR code scan fails / app doesn't install** — confirm Developer Mode is
  still enabled (Zepp app → Profile → Settings) and that `zeus preview` is
  still running when you scan.
- **Manual sync works but nothing syncs in the background** — read the two
  small grey diagnostic blocks on the watch face. **Scroll down** past the Sync
  button to reach them; they sit below the bottom of the screen, and on a round
  watch scrolling also brings them into the wide middle of the display where
  nothing is cut off by the bezel. The first covers starting the background
  service, the second what it does once started:

  | Field | Meaning |
  | --- | --- |
  | `q:` | Background-service permission: `2` granted, `0` not authorized, `1` unknown permission |
  | `r:` | What the permission request returned: `0` a dialog is up, `1` nothing could be requested, `2` already granted, `?` not needed |
  | `st:` | What `start()` returned: `0`/`true` success, `3` permission not in effect yet, `needs-permission` waiting for the Enable button, `no-config` the phone has never been reached so the pace is unknown, `no-webhook` no webhook URL is set so there is nothing to sync to, `threw:…` the call failed. This is the *last* start's result, so it goes stale on opens that correctly left a healthy service running |
  | `run:` | Whether the background service was still running when you opened the app. `0` is healthy — the service ends itself once its sync is done, so between runs nothing is resident. A persistent `1` is a run stuck mid-sync, which blocks the alarm from starting another |
  | `al:` | The alarm that drives the whole thing, as `<id>/<swept>`. An id of `0` means it could not be set, and since the alarm is the only clock, nothing will sync in the background. The swept count is the leak detector — if it climbs across app opens, alarms are accumulating. A rising *id* is normal; the system never reuses them |
  | `wd:` | The background service's own breadcrumb, `<runs>/<done>:<outcome>`, counting alarm-woken runs only. `runs` is recorded the instant the service wakes; `done` once the data has been handed to Bluetooth. `0/0` means no alarm has ever woken it; `runs` climbing while `done` stays at `0` means each run is being cut short. Both climbing is what working looks like — but `done` only says the watch sent, not that the phone received, so read it next to `a:` |
  | `hi:` | When the background service last reached the phone at all |
  | `bg:` | When a background sync last reached the phone |
  | `n:` | How many syncs the service has delivered in total. Opening the app produces one, so this rises either way |
  | `a:` | How many of those the alarm caused rather than you opening the app, followed by what caused the most recent one (`wd` the alarm, `page` the app being opened). **This is the one that says whether background sync works** — leave the watch alone for one full interval, then check it has gone up |
  | `t:` | Which timer the background service's context claims to offer: `T`, `I`, or `-` for none. Informational only — the service uses no timers, because Zepp OS does not actually run them in that context whatever this says |
  | `e:` | The stage it last got stuck at: `sensors` or `sync`. Absent when the last cycle completed |

  The last five come from your **phone**, in its reply to the last sync — the
  background service can't write to the watch's own storage, so it reports
  through the Bluetooth round trip it makes anyway. They're as fresh as the
  service's last run, no fresher.

  Opening the app refreshes them by itself: the automatic config pull carries
  them back, so you don't need to send a sync to read them.

  Reading them:

  - `run:0` with `st:needs-permission` — tap **Enable background sync**.
  - `run:0` with `st:no-config` — the watch has never managed to reach the phone,
    so it doesn't know your interval and starts nothing. Tap **Refresh config**
    with the phone nearby and Bluetooth on.
  - `run:0` with `st:no-webhook` — no webhook URL is set on the phone. Go back to
    step 3.2, then tap **Refresh config**.
  - `run:0` with `st:3` — the permission is granted but not yet in effect for
    the running app. The app retries for a few seconds on its own; if that isn't
    enough the button offers to close the app so you can reopen it.
  - `a:` climbing while you leave the watch alone — working normally. Give it at
    least one full sync interval before judging.
  - `a:` frozen at 0 while `n:` rises — the service runs whenever you open the
    app, but the alarm never wakes it. Every sync is costing you an app open.
    Check `al:` first.
  - `al:0/…` — the alarm could not be set. Since the alarm is the only clock,
    nothing will sync in the background at all. Check that the app was granted
    its permissions, then reopen it.
  - `al:` set but `a:` still 0 after several intervals — read `wd:` next, that is
    what it is for. `wd:0/0` means the alarm exists but nothing is being woken by
    it; `wd:3/0` means the wake-up works and each run is being cut short before
    its round trip completes; `wd:3/3` with `a:0` means the runs complete and the
    fault is on the phone side.
  - `run:1` — a run is stuck holding the slot. This is the one failure that
    cannot heal on its own: starting a service that is already running does
    nothing, so every alarm from then on is silently wasted. Opening the app
    clears it, which is exactly what the open you are reading this during just
    did — so a `run:1` you see once is already fixed, and only a `run:1` on
    *every* open is a problem. `e:sync` usually accompanies it.
  - `hi:` set but `n:0` — the service reaches the phone and never delivers a
    sync. `e:` names the stage that failed, and the phone's Settings screen
    carries the full error text.
  - `hi:never` — the service never runs at all. Nothing on the watch can be
    misconfigured to cause this; it is a platform-level failure to launch the
    background service.
