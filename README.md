# PolyChatUwU

One screen for live crypto streaming. Every chat (Twitch, Kick, X) merged into a single feed, a market terminal beside it (live prices, Polymarket odds, a crypto newswire), and a broadcast overlay you drop straight into OBS. No API keys, no logins, no paid services.

Built for the Market Bubble Vibe Code Challenge.

## What you get

Three pages, one server:

| Route | Who it is for | What it is |
|-------|---------------|------------|
| `/` or `/app` | the streamer | the cockpit: merged chat, a candle of chat hype, prices, Polymarket, the newswire, soundboard and a watch view |
| `/overlay` | OBS | a transparent broadcast layer (chat, hype, crowd vs market, news toasts). Add `?solid` to preview it on black |
| `/watch` | your audience | a read only page with the stream and the shared chat. No login, nothing to download |

## Requirements

* Node 20 or newer (npm comes with it)
* A couple of minutes

## Run it

```bash
npm install                       # installs both workspaces (server + web)
npx playwright install chromium   # only for Kick and X. Twitch works without it
npm run dev                       # server on :8787, app on :5173
```

Open http://localhost:5173 and add a channel in the left rail.

That is the whole setup. There is no `.env` file to create, no key to paste, no account to make. The app finds the server at `ws://localhost:8787` on its own.

## Adding streams

Left rail, Channels tab:

* **Twitch** works instantly. Type the channel name (for example `theburntpeanut`). It uses anonymous Twitch chat, so there is nothing to install.
* **Kick** needs the `npx playwright install chromium` step above. Kick hides its chat behind Cloudflare, so a headless browser looks up the room id once.
* **X** lets you paste a profile or broadcast URL. This is the least reliable of the three, so treat it as a bonus.

Use the Watch toggle in the top toolbar to choose which stream shows in the center and on the overlay.

## Putting the overlay in OBS

1. Add a Browser source in OBS.
2. URL: `http://localhost:5173/overlay`
3. Size: 1920 x 1080.
4. Leave the background transparent. The widgets float over your game or stream capture.

The overlay embeds whichever channel you selected, so the real stream shows inside the frame automatically. If you would rather composite the video yourself in OBS, use `http://localhost:5173/overlay?novideo` to keep the center empty.

Note: video autoplay works in Chrome and inside OBS. Brave blocks autoplay even when muted, so if you preview the overlay in Brave you may have to click once.

## Optional settings (none required)

Set any of these only if you want to:

| Variable | Side | Default | What it does |
|----------|------|---------|--------------|
| `HOST_TOKEN` | server | empty (open) | locks the dashboard. When set, open `/app?key=YOUR_TOKEN`. Viewers on `/watch` can still chat but cannot change channels or the overlay |
| `PORT` | server | `8787` | server port |
| `VITE_WS_URL` | web | `ws://<host>:8787` | point the app at a different server |
| `VITE_TENOR_KEY` | web | a shared public key | your own Tenor key for the GIF picker |

## How it is wired

```
Twitch  (anonymous IRC over WebSocket) ─┐
Kick    (Pusher socket, room id via Chromium) ─┤→ Node server: normalize, enrich, fan out (one WebSocket) → React UI
X       (Playwright) ─┘                            + live prices, Polymarket odds, crypto newswire
```

* `server/` is Node and TypeScript, run directly with `tsx` (no build step)
* `web/` is Vite, React and Tailwind v4

## Honest status

* Twitch chat: solid.
* Prices, Polymarket odds and the crypto newswire (RSS): solid, they refresh on their own.
* Kick chat: works once chromium is installed.
* X feed: keyless and fragile by nature, so it can go quiet for stretches.
* Everything here is keyless and free. Nothing needs a paid API or a paid login.
