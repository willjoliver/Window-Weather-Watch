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
- The current implementation requests permission on user interaction (the Monitor button) — that's correct. However, browser push notifications while the tab is closed require implementing the Push API and a service worker with a push subscription (not yet implemented).

Recommended minimal deploy flow

1. Create a Postgres instance on Neon and get `DATABASE_URL`.
2. Deploy `artifacts/api-server` to Railway/Render; set `DATABASE_URL`.
3. Build and deploy `artifacts/window-weather` to Vercel/Netlify; set `VITE_API_URL` to the deployed API URL.

If you'd like, I can open a PR to: (a) add a small service worker + Push subscription flow, (b) add deployment GitHub Actions, or (c) make the frontend warn when Notification permission cannot be requested due to insecure context.
