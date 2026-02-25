# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Workout.lol — a Next.js web app for creating workout routines based on available equipment and target muscles. Users select equipment, pick muscle groups, get exercise suggestions from a MongoDB database, then track their workout. Supports anonymous (localStorage) and authenticated (NextAuth) usage.

## Commands

- `npm run dev` — start dev server on port 3000
- `npm run build` — production build
- `npm run lint` — lint with next lint
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — format with prettier

## Architecture

**Next.js 13 (Pages Router)** with MongoDB backend. No test framework is configured.

### Data Flow: Dual Storage

The `useAccount` hook (`utils/useAccount.js`) is the central state manager. It transparently switches between:
- **Anonymous users**: localStorage via `useLocalStorage`
- **Authenticated users**: MongoDB via SWR + `/api/user` endpoints

Components call `useAccount()` and get `[userData, setUserData]` regardless of auth state.

### API Routes (`pages/api/`)

- `exercises.js` — GET: query exercises by equipment/muscles/difficulty; POST: fetch exercises by IDs. Uses MongoDB aggregation pipeline (`getQuery`) that adds a `mainMuscle` computed field and filters out unsupported categories.
- `workout.js` — GET: fetch a shared workout by ID
- `user/index.js` — GET/PUT: current user data
- `user/[slug].js` — public user profile by slug
- `auth/[...nextauth].js` — NextAuth with Credentials, Google, Twitter providers
- `sign-up.js`, `muscles.js`, `migrate.js` — supporting endpoints

### Database (`lib/db-helper.js`)

Direct MongoDB driver (no ORM). Two collections: `exercises` and `users`. Each helper opens/closes a connection per request. Seed data lives in `lib/dump/prod/`.

### Main UI Flow (`pages/index.js`)

A 4-step `Stepper` (Mantine): Equipment → Muscles → Exercises → Workout. Supports repeating previous workouts (`?repeat_id=`) and shared workouts (`?share_id=`).

### Key Libraries

- **Mantine v6** for UI components + `@tabler/icons-react`
- **SWR** for data fetching/caching
- **next-auth** for authentication
- **next-pwa** for PWA support
- **react-beautiful-dnd** for drag-and-drop in exercises
- **CSS Modules** (`.module.css`) for component styling

### Path Aliases

`@/*` maps to project root (configured in `jsconfig.json`).

## Code Style

- Prettier: single quotes, no semicolons, trailing commas (es5), 2-space indent
- ESLint: extends `next/core-web-vitals` + `prettier`
- JSX uses single quotes (`jsxSingleQuote: true`)

## Environment Variables

See `.env.dist` for required variables: `MONGODB_URI`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `PASSWORD_HASH_SECRET`, and optional OAuth credentials (`GOOGLE_CLIENT_ID/SECRET`, `TWITTER_CLIENT_ID/SECRET`).

## Docker

Docker setup in `docker/` with compose file. Use `.env.docker` for container config; don't modify `MONGODB_URI` if using the bundled MongoDB container.
