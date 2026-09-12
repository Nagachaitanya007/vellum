# Vellum

A local-first notes app: the quiet of Apple Notes, the links of Obsidian, a little Roam, a little Notion.

Sign in with **your** Google account to keep the same vault on your phone and computer. Without an account, notes stay on this device.

This repository is a **standalone** app. You do not need Grok, a Grok sandbox, or any Grok auth service to run or deploy it.

## What’s in it

- Folders, pins, tags, daily notes, and a paper writing surface
- Wiki links (`[[page]]`), backlinks, unlinked mentions, and `![[page]]` embeds
- Vault graph with configurable node shape, color, size, and arrows
- Markdown pages or canvas boards
- Canvas: live labels, geometric shapes, 8-handle resize, pen, undo/redo, PNG/JPEG
- Find and replace, slash commands, command palette, light and dark
- Google sign-in + Turso: the same vault on every device

## How authentication and sync work

```
Google OAuth (your Cloud project)
        ↓
Vellum Better Auth session (cookie on your domain)
        ↓
Authenticated Vellum user id
        ↓
Turso (libSQL) — source of truth for users and notes
```

Google is only identity. It does not store notes in Drive. Notes live in **your** Turso database, scoped by `user_id`. Device A writes to Turso; Device B signed in as the same Google account reads those rows.

Browser `localStorage` is a cache / offline buffer. After sign-in, Turso wins.

## Configure Google OAuth

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Configure the OAuth consent screen (External is fine for a personal app).
   - Add yourself as a **test user** while the app is in Testing.
   - Scopes: Better Auth requests `openid`, `email`, and `profile`.
3. Create an **OAuth 2.0 Client ID** of type **Web application**.
4. Authorized JavaScript origins:
   - `http://localhost:8080` (local)
   - `https://your-domain.com` (production, e.g. `https://vellum.vercel.app`)
5. Authorized redirect URIs:
   - `http://localhost:8080/api/auth/callback/google`
   - `https://your-domain.com/api/auth/callback/google`
6. Copy the Client ID and Client Secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Set `BETTER_AUTH_URL` to the same origin (no trailing slash).
8. Set `BETTER_AUTH_SECRET` to a long random string (`openssl rand -base64 32`).

Vellum talks to Google directly. Google redirects back to **this** app at `/api/auth/callback/google`.

## Configure Turso

1. Install the CLI: `curl -sSfL https://get.turso.tech/install.sh | bash`
2. `turso auth login`
3. `turso db create vellum`
4. `turso db show vellum --url` → `TURSO_DATABASE_URL`
5. `turso db tokens create vellum` → `TURSO_AUTH_TOKEN`
6. Apply schema: `npm run db:migrate`

Without Turso env vars, local `npm run dev` uses `file:.data/vellum.db`. Do **not** use a file URL on Vercel — serverless disks are ephemeral.

## Run locally

```bash
cp .env.example .env
# fill GOOGLE_* , BETTER_AUTH_SECRET, and optionally TURSO_*
npm install
npm run dev
```

Open the printed local URL. Sign in with Google. Notes you create are written to Turso (or the local file DB if Turso is unset).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run db:migrate` | Apply `migrations/*.sql` to Turso (loads `.env`) |
| `npm run build` | Production build (migrates if Turso is set) |
| `npm run typecheck` | TypeScript check |

## Deploy independently (Vercel is fine)

This app is a TanStack Start / Vite / Nitro app. It does **not** need Grok, a Grok sandbox, or Grok auth secrets.

1. Create Google OAuth credentials (above) with your production origin and `/api/auth/callback/google`.
2. Create a Turso database and token (above).
3. Import the GitHub repo into [Vercel](https://vercel.com). Framework can stay on Other / Vite — Nitro emits the Vercel Build Output API.
4. Set environment variables on the host (Production **and** Preview; both **Build** and **Runtime**):

   | Variable | Purpose |
   |---|---|
   | `VITE_AUTH_ENABLED` | `true` (needed at **build** time) |
   | `BETTER_AUTH_URL` | Public origin, e.g. `https://vellum.vercel.app` |
   | `BETTER_AUTH_SECRET` | Session signing secret (`openssl rand -base64 32`) |
   | `GOOGLE_CLIENT_ID` | Your Google OAuth client id |
   | `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret |
   | `TURSO_DATABASE_URL` | `libsql://…turso.io` |
   | `TURSO_AUTH_TOKEN` | Turso token |

5. Deploy. `npm run build` runs `npm run db:migrate` against Turso.
6. After the first deploy, copy the production URL into Google’s authorized origin + redirect URI, then redeploy if the URL changed.
7. Open the production URL, sign in with Google, create a note.
8. Open the same URL in another browser/device, sign in with the same Google account, and the note should appear.

Do not commit `.env` or Turso tokens. `.env.example` is the template.

## Cross-device check

1. Device A: sign in, create and edit a note.
2. Device B: sign in as the same Google account.
3. The note is loaded from Turso (not from Device A’s browser).
4. Edit on B, wait a few seconds (or refocus the tab) on A — A pulls the update.

Creates, edits, deletes, multiple notes, sign-out/in, refresh, and reopening the browser all go through the same `notes` / `vault_settings` rows keyed by `user_id`.

## Keyboard

| Shortcut | Action |
|---|---|
| `⌘/Ctrl N` | New page or board |
| `⌘/Ctrl P` | Command palette |
| `⌘/Ctrl F` | Find in note |
| `⌘/Ctrl H` | Find and replace |
| `⌘/Ctrl S` | Save (notes already persist as you type) |
| `⌘/Ctrl ⇧ G` | Vault graph |
| `⌘/Ctrl ⇧ L` | Light / dark |
| `⌘/Ctrl ⇧ D` | Today’s daily note |
| `/` at the start of a line | Insert a block |
| `[[` | Link to a note |

## Stack

React 19, TanStack Start, Tailwind v4, Better Auth (Google), Turso/libSQL, Zustand (cache).
