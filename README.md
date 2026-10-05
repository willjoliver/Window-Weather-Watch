# Window Weather Watch

Lightweight app that monitors local weather and notifies you when it's a good time to open or close your window.

This monorepo contains a Vite + React frontend and an Express API server with a PostgreSQL database (Drizzle ORM). It was created for Replit but can be deployed elsewhere.

Key pieces

- artifacts/window-weather — React frontend (Vite)
- artifacts/api-server — Express API server
- db — Drizzle / migrations / schema

Quick local run (requires pnpm)

1. Install dependencies: `pnpm install`
2. Start the API server (from repo root):

   ```bash
   pnpm --filter artifacts/api-server run dev
   ```

3. Start the frontend (separate terminal):

   ```bash
   pnpm --filter artifacts/window-weather run dev
   ```

Deploy notes

- Database: use Neon (free) or any managed Postgres. Provide `DATABASE_URL` to the API server.
- API server: Railway or Render can host the Express app. Set `DATABASE_URL` in the service's env.
- Frontend: Netlify, Vercel, or Netlify can host the built static files. When deploying the frontend, set the Vite env var `VITE_API_URL` to your API URL (e.g. `https://your-api.onrailway.app`).

Important: notifications

- The app uses the browser Notification API. For permission to be granted and to actually receive notifications the site must be served over HTTPS.
- Two notification modes:
  - **Monitor mode** (frontend): toggle "Monitor" on the dashboard to poll weather every N minutes (per `checkIntervalMinutes`) while the tab is open. Alerts fire as in-app toasts and via the Notification API when conditions change.
  - **Background push** (server): toggle "Push" on the dashboard to subscribe through the Push API + service worker (VAPID keys). The API server's scheduler (`artifacts/api-server/src/scheduler.ts`) re-checks weather on the configured interval and sends a web push to all subscribers whenever the window-friendly state flips, even with the tab closed. Requires `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on the server. A Test button on the dashboard verifies delivery.

Recommended minimal deploy flow

1. Create a Postgres instance on Neon and get `DATABASE_URL`.
2. Deploy `artifacts/api-server` to Railway/Render; set `DATABASE_URL`.
3. Build and deploy `artifacts/window-weather` to Vercel/Netlify; set `VITE_API_URL` to the deployed API URL.

If you'd like, I can open a PR to: (a) add deployment GitHub Actions, or (b) make the frontend warn when Notification permission cannot be requested due to insecure context.
