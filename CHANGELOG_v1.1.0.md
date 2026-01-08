# Changelog v1.1.0 - Passive Harvesting Feature

## Release Date: 2026-01-04

## 🌾 New Feature: Passive Profile Harvesting

This release introduces the **Passive Harvesting** system - profiles are now automatically captured when users browse LinkedIn, and can be bulk-synced to Yena.

### What's New

#### 1. Passive Scraping
- **Automatic Capture**: When you visit ANY LinkedIn profile (`linkedin.com/in/*`), the extension silently captures the profile data
- **No User Action Required**: Runs in the background without affecting the manual save flow
- **Deduplication**: Same profile won't be captured twice in a session
- **Non-Intrusive**: No scrolling or visible changes to preserve UX

#### 2. Harvest Queue Storage
- Profiles stored locally in `chrome.storage.local`
- Supports up to ~1000 profiles before auto-cleanup
- Tracks sync status (synced/unsynced)
- Persists across browser sessions

#### 3. Sync to Yena
- **Manual Sync**: Click "Sync to Yena" button in extension popup
- **Auto-Sync**: Profiles automatically sync when you open the Yena app
- **Batch Upload**: Sends all unsynced profiles in one API call
- **Visual Feedback**: Shows import/update/skip counts after sync

#### 4. Updated Popup UI
- New "Harvested Profiles" panel with harvest count
- Sync button with loading state
- Last synced timestamp
- Compact info section for manual save instructions
- "Open Yena Dashboard" button

### Files Changed

| File | Change |
|------|--------|
| `harvest.ts` | **NEW** - Harvest queue management utilities |
| `components/HarvestPanel.tsx` | **NEW** - Popup UI component for harvest feature |
| `content.tsx` | Added passive harvesting logic (existing manual flow unchanged) |
| `background.ts` | Added harvest message handlers (GET_HARVEST_STATUS, SYNC_HARVEST, CLEAR_SYNCED) |
| `contentApp.ts` | Added auto-sync on Yena app load |
| `App.tsx` | Integrated HarvestPanel into popup |
| `types.ts` | Added new message types and HarvestSyncResponse interface |
| `manifest.json` | Version bump to 1.1.0 |

### API Endpoint Required

The backend needs to implement:

```
POST /api/v1/integrations/linkedin/harvest

Request:
{
  "profiles": [
    {
      "linkedinUrl": "https://linkedin.com/in/john-doe",
      "scrapedData": { /* ParsedLinkedInProfile */ },
      "capturedAt": "2026-01-04T10:30:00Z"
    }
  ]
}

Response:
{
  "imported": 12,
  "updated": 5,
  "skipped": 3,
  "errors": []
}
```

### Backward Compatibility

✅ **All existing features work exactly as before:**
- Manual sidebar/preview/save flow
- Floating "✦ Yena" button on LinkedIn profiles
- Background CHECK_FOR_UPDATES handling
- Extension popup authentication

### Known Limitations

1. Passive harvest only captures data visible without scrolling (to avoid UX disruption)
2. Experience/Education sections may be incomplete if LinkedIn lazy-loads them
3. Auto-sync only triggers on initial page load of Yena app (not on subsequent navigation)
