# Changelog v1.0.5

## New Feature: Check for Updates 🔄

Users can now refresh candidate data directly from their LinkedIn profile via the main app.

### How It Works
1. Click "Check for Updates" on a candidate profile in the Yena app
2. Extension opens LinkedIn profile in background tab
3. Scrapes latest data (experiences, skills, education, etc.)
4. Sends data back to main app for merging
5. Background tab closes automatically

### Technical Changes

| File | Change |
|------|--------|
| `manifest.json` | Added `contentApp.js` for app.yena.ai, `externally_connectable` permissions |
| `background.ts` | Added `CHECK_FOR_UPDATES` handler with queue system |
| `content.tsx` | Added `TRIGGER_SCRAPE` listener at top level |
| `contentApp.ts` | **NEW** - DOM marker injection + postMessage relay |
| `parser.ts` | Fixed `requestAnimationFrame` → `setInterval` for background tabs |

### Data Scraped
- First/Last Name, Headline, Location
- Current Company
- Profile Picture URL
- Experiences (with dates, locations)
- Education
- Skills
- Languages

### Notes for Deployment
- Requires main app to implement `postMessage` listener
- See `app_developer_spec.md` for backend integration guide
