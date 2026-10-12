# pocketjs-notify

JG-122 experiment: a minimal **server-pushes-notification → PocketJS app answers YES/NO → answer recorded** loop, fully local (browser dev host, no real device).

- `server/` — Bun + Hono notify server (port **8899**)
- `app/` — PocketJS Solid app (`notify-main.tsx` mount entry + `app.tsx` UI), built through the untouched PocketJS clone at `~/.notebook/workspace/pocketjs`
- `validation/` — E2E screenshots

## Run

Prerequisites: bun, Chrome. One-time setup in the PocketJS clone:

```bash
cd ~/.notebook/workspace/pocketjs
bun install                          # repo deps for tools/build.ts
bun tools/wasm.ts                    # engine/wasm -> hosts/web/pocketjs.wasm (rustup target add wasm32-unknown-unknown if missing)
```

Build the app bundle (output lands in the clone's `dist/`, which the dev host serves):

```bash
cd ~/.notebook/workspace/pocketjs-notify
bun ~/.notebook/workspace/pocketjs/tools/build.ts app/notify-main.tsx
```

Start both ends:

```bash
cd ~/.notebook/workspace/pocketjs-notify/server && bun run src/server.ts   # :8899
cd ~/.notebook/workspace/pocketjs && bun hosts/web/serve.ts                # :8130
```

Open the app (portrait phone viewport via host query params):

```bash
open "http://127.0.0.1:8130/?demo=notify-main&width=480&height=800"
```

## Verify by hand

1. Send a notification — either from the sender page <http://127.0.0.1:8899/> or:

   ```bash
   curl -X POST http://127.0.0.1:8899/notify -H 'content-type: application/json' \
        -d '{"text":"Coffee break in 5 min?"}'
   ```

2. Within ~2.5 s (poll interval) the app shows the notification card with YES / NO.
3. Tap YES or NO on the canvas (mouse/touch), or d-pad to focus a button and press Enter/Z (CIRCLE).
4. The server logs `[answer] id=N answer=yes|no` and <http://127.0.0.1:8899/answers> records it; the app returns to the waiting state.

API: `POST /notify {text}` (1..120 printable ASCII — the app's font atlas bakes ASCII 32..126 only), `GET /pending`, `POST /answer {id, answer:"yes"|"no"}`, `GET /answers`.

## Automated E2E

```bash
cd ~/.notebook/project/gjuoun/pocketjs/plan/2026-10-11/pocketjs-notify/scripts
bun install && bun run e2e.ts
```

Boots both servers, drives the app in headless Chrome (puppeteer-core, system Chrome), pushes two notifications, clicks YES then NO at the fixed button coordinates, asserts the answers land server-side, the notification appears within 5 s of the push, and the browser console has zero errors (favicon 404 excluded as a host-page artifact). Screenshots land in `validation/`. Last verified: `E2E PASS: poll ok | notify-shown 2547ms<=5000 | yes recorded (id 1) | no recorded (id 2) | console errors 0 | pageerrors 0`.

## How it works / constraints found

- **Rendering**: browser dev host (Rust core compiled to wasm + software rasterizer). `pocket build` web/linux targets have no working backend — the browser host is the only local path.
- **HTTP**: `import { fetch } from "@pocketjs/framework/net"` — fetch-shaped, no WebSocket (v1 by design), max 2 concurrent requests, response cap 128 KiB. The app polls `GET /pending` every 2.5 virtual seconds via `after()` from `@pocketjs/framework/clock` (virtual time = wall time at the host's 60 Hz).
- **CORS**: the app origin is :8130, the server :8899 — the server enables `hono/cors` so the guest's JSON POST (and its preflight) pass.
- **Pointer input**: the playground host feeds the guest only `frame(buttons, analog)` — canvas taps never reach the guest through the input contract. The bundle evals in the page realm, so `notify-main.tsx` installs a small pointer shim (`typeof document` guarded, browser only) that maps canvas pointer events to the framework's own `hitFocusable`/`focusNode`/`pressNode` authority. On a device host the shim is inert and the buttons still work via d-pad + CIRCLE.
- **Tailwind subset**: class attributes must be single full literals; the supported set is smaller than real Tailwind (`rounded-2xl` does not exist — `rounded-xl` max; the build only warns, so a bad token silently drops the whole literal — the E2E click assertions are the layout proof).
- **Dynamic text**: server-pushed text is not in the AST at build time; only ASCII 32..126 is baked into every atlas by default, hence the ASCII-only rule.
- **Solid**: `createResource` / `useTransition` / `startTransition` are rejected by the compiler; the app uses `createSignal` + `Show` only. Unmount ordering matters: flip the phase (unmount the card) before clearing the data signal it reads.

JG-122 · plan: `~/.notebook/project/gjuoun/pocketjs/plan/2026-10-11/pocketjs-notify/plan.md`
