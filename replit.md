# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Window Weather Notifier app — monitors weather and sends browser notifications when it's a good time to open or close your window on work days.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + framer-motion
- **Weather**: Open-Meteo API (free, no key required)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## App Features

- **Dashboard**: Current weather status, window open/close recommendation, live temperature/humidity/wind metrics, hourly forecast timeline, today's summary
- **Settings**: Configure temperature range, humidity, wind speed thresholds, work days/hours, notification preferences, check interval
- **History**: Window open/close event log, weekly stats (opens, closes, avg duration, most common open hour)
- **Notifications**: Browser Notification API, optional live monitoring mode that polls weather every N minutes and alerts on condition changes
- **Location**: Uses browser Geolocation API for live coordinates

## API Routes

All routes under `/api`:
- `GET /healthz` — health check
- `GET /weather/current?lat=&lon=` — current weather + window recommendation
- `GET /weather/forecast?lat=&lon=` — hourly forecast for today
- `GET /weather/today-summary?lat=&lon=` — summary of window-friendly hours
- `GET /settings` / `PUT /settings` — user preferences
- `GET /events` / `POST /events` — window open/close event log
- `GET /events/stats` — weekly event statistics

## DB Schema

- `settings` — user thresholds and schedule preferences (single row)
- `window_events` — log of window open/close events with conditions

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
