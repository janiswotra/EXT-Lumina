# Yena Candidate Clipper — Chrome Extension

## Project Overview

Chrome/Edge extension (Manifest V3) that captures LinkedIn profiles and syncs them to the Yena ATS platform. Supports regular LinkedIn and Sales Navigator.

## Tech Stack

- **Runtime**: Chrome Extension (Manifest V3 service worker)
- **UI**: React 18 + TypeScript + Tailwind CSS
- **Build**: Vite (4 separate builds: popup, content, contentApp, contentMessages)
- **Styling**: Tailwind with custom dark theme (Attio-inspired), Shadow DOM isolation for injected UI
- **Types**: `@types/chrome` for Chrome API types — never use `declare const chrome: any`

## Build & Dev

```bash
npm run build    # tsc + 4 Vite builds → dist/
npm run dev      # Vite dev server (popup only)
```

After building, load `dist/` as unpacked extension in chrome://extensions.

No tests exist. Verify changes by building and manually testing in browser.

## Architecture

### Entry Points (4 separate bundles)

| File | Build Config | Runs On | Purpose |
|------|-------------|---------|---------|
| `index.tsx` → `App.tsx` | `vite.config.ts` | Extension popup | Popup UI with dashboard link |
| `background.ts` | `vite.config.ts` | Service worker | API calls, scrape queue, message routing |
| `content.tsx` → `LinkedInInjector.tsx` | `vite.content.config.ts` | LinkedIn pages | Profile sidebar + save button |
| `contentApp.ts` | `vite.contentApp.config.ts` | app.yena.ai | Bridge: web app ↔ extension |
| `contentMessages.tsx` | `vite.contentMessages.config.ts` | LinkedIn pages | Message sync button in conversations |

### Key Directories

```
components/          # React UI components (Sidebar, Preview, AuthScreen, Toast, etc.)
components/ui/       # Reusable primitives (Input, PickerModal)
utils/               # Shared utilities (cn, chrome, linkedin, validation, time)
utils/parsers/       # LinkedIn DOM parsers (regular, salesNav, contact, shared)
```

### Important Files

- `constants.ts` — env vars via `import.meta.env.VITE_*`, storage keys, DOM IDs
- `types.ts` — all shared TypeScript interfaces
- `.env` — environment variables (not committed, see `.env.example`)

## Conventions

### Coding Style
- Dark-only UI — no `dark:` Tailwind variants (everything renders in dark context)
- Use `cn()` from `utils/cn.ts` for conditional class merging (clsx + tailwind-merge)
- Use `safeSendMessage()` from `utils/chrome.ts` for message passing (handles invalidated context)
- Use `DOM_IDS` from `constants.ts` for element IDs, not hardcoded strings
- Console logs use `[Yena ...]` prefix (not Lumina)
- Extension version comes from `chrome.runtime.getManifest().version`, never hardcoded

### Chrome Extension Patterns
- MV3 service workers can be killed after 30s inactivity — don't rely on in-memory state in `background.ts`
- Content scripts run in Shadow DOM for style isolation from LinkedIn
- `contentApp.ts` validates origins strictly (no `startsWith`, only exact match)
- URLs must be validated with `isValidScrapeUrl()` before opening tabs
- Storage keys use `yena_` prefix (migrated from legacy `lumina_` prefix)

### Security
- Never log API keys or sensitive data to console
- Validate `event.origin` with strict equality, not `startsWith`
- Validate URLs before scraping (must be linkedin.com with valid profile path)
- `externally_connectable` is scoped to specific origins and ports

### React Patterns
- Avoid `viewMode`/state in useEffect dependency arrays that cause loops — use refs for reading without triggering re-renders
- Guard async operations against URL changes (check `window.location.href` after every await)
- `mergeProfileReliably()` must explicitly handle all array fields to prevent data loss
- Toast `onClose` uses ref pattern to avoid timer restart on re-render

## Backend

The extension communicates with Supabase Edge Functions at the URL in `VITE_API_BASE_URL`:
- `GET /extension-auth` — auth check
- `GET /linkedin-status` — candidate existence check
- `GET /extension-jobs`, `/extension-stages`, `/extension-lists` — metadata
- `POST /linkedin-import` — save candidate
- `POST /linkedin-messages-sync` — sync messages

Auth: `x-api-key` header (personal API key set by user in extension).
