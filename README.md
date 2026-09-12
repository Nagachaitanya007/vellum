# Vellum

A local-first notes app: the quiet of Apple Notes, the links of Obsidian, a little Roam, a little Notion.

Sign in with Google or X to keep the same vault on your phone and computer. Without an account, notes stay on this device.

## What’s in it

- Folders, pins, tags, daily notes, and a paper writing surface
- Wiki links (`[[page]]`), backlinks, unlinked mentions, and `![[page]]` embeds
- Vault graph with configurable node shape, color, size, and arrows
- New note asks for a **markdown page** or a **canvas board**
- Canvas boards: labels inside shapes, colorful diagram templates, select/move, pen, undo/redo, PNG/JPEG
- Find and replace in the page
- Light and dark
- Slash commands (`/`) for headings, lists, callouts, tables, toggles, templates, plus sequence diagrams, flowcharts, math, highlight, and today’s date
- Table view of the note list
- Command palette
- Sign-in sync: write on one device, open the same account on another
- Download a note as markdown, or the whole vault as a zip for Google Drive

## Run it

```bash
npm install
npm run dev
```

Then open [http://localhost:8080](http://localhost:8080).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 8080 |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |

## Keyboard

| Shortcut | Action |
| --- | --- |
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

React 19, TanStack Start, Tailwind v4, Zustand (`localStorage`).
