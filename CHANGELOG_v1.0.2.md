# Yena Extension v1.0.2 - Changelog

**Date:** December 17, 2024  
**Summary:** Performance improvements, reliability fixes, and domain migration to app.yena.ai

---

## 🌐 Domain Migration

The extension has been migrated from the Google Cloud Run URL to the new production domain.

### Configuration Changes

| Setting | Old Value | New Value |
|---------|-----------|-----------|
| API Base URL | `https://luminamain-545195331830.europe-west1.run.app/api/v1` | `https://app.yena.ai/api/v1` |
| App Domain | `https://luminamain-545195331830.europe-west1.run.app` | `https://app.yena.ai` |
| Extension Version | 1.0.1 | 1.0.2 |

### Manifest Updates
- `host_permissions`: Now includes `https://app.yena.ai/*` and `https://*.yena.ai/*`
- `externally_connectable`: Now includes `https://app.yena.ai/*` and `https://*.yena.ai/*`
- `default_title`: Changed from "Lumina" to "Yena"

---

## 🐛 Bug Fixes

### 1. Blank Panel Issue (FIXED)
**Problem:** Extension showed an empty panel with no candidate data when clicking the Yena button.

**Root Cause:** The extension was attempting to parse the LinkedIn profile DOM before LinkedIn's lazy-loaded content was ready.

**Solution:** 
- Added `waitForProfileToLoad()` function that uses `requestAnimationFrame` to poll for DOM readiness
- Added `parseProfileWithRetry()` function with exponential backoff (3 attempts, 400ms base delay)
- Profile parsing now waits up to 5 seconds for LinkedIn's DOM elements to appear

### 2. Email Not Fetching for Some Candidates (IMPROVED)
**Problem:** Contact info scraping was unreliable and failed to extract email for some 1st-degree connections.

**Solution:**
- Increased modal wait timeout from 3s → 4s
- Increased content render wait from 300ms → 500ms
- Added multiple email extraction strategies:
  1. `mailto:` link detection (prioritized)
  2. Section-based scanning for "Email" headers
  3. Regex fallback pattern matching
- Added more CSS selectors for LinkedIn's varying DOM structures
- Better phone number validation and extraction

### 3. Data Bleeding Between Profiles (FIXED)
**Problem:** Previous candidate's data (email, phone) could persist when navigating to a new profile.

**Solution:**
- Implemented proper state reset via `resetProfileState()` callback
- Contact info is now only preserved if `linkedinUrl` matches current URL
- URL change detection uses `useRef` for more reliable tracking

---

## ⚡ Performance Improvements

### Faster Extension Initialization
| Metric | Before | After |
|--------|--------|-------|
| Initial injection delay | 1500ms | 500ms |
| URL polling interval | 2000ms | 1500ms |

- Added dual injection strategy: initial attempt at 500ms with 1500ms fallback
- Extension now appears ~1 second faster on page load

### Improved Loading UX
- Added `isFetchingData` state for tracking data extraction progress
- Preview component now shows animated skeleton loading UI while parsing
- "Loading Profile..." badge with spinner displays during data fetch
- Button is disabled while loading to prevent premature interactions

---

## 📁 Files Modified

### Core Logic
- **`LinkedInInjector.tsx`** - Complete refactor of data loading lifecycle
  - Added: `isFetchingData`, `currentUrlRef`, `resetProfileState`
  - Rewrote: URL change detection useEffect with proper cleanup
  - Added: Async data loading with `waitForProfileToLoad` and `parseProfileWithRetry`

- **`utils/parser.ts`** - Enhanced parsing reliability
  - Added: `waitForProfileToLoad()` - DOM readiness checker
  - Added: `parseProfileWithRetry()` - Retry logic with exponential backoff
  - Enhanced: `scrapeContactInfo()` - Multi-strategy email extraction

- **`content.tsx`** - Faster injection
  - Changed: Initial setTimeout from 1500ms to 500ms
  - Added: Fallback injection at 1500ms

### UI Components
- **`components/Preview.tsx`** - Loading state UI
  - Added: `isFetching` prop
  - Added: `SkeletonRow` component for loading animation
  - Added: Skeleton loading for avatar, name, headline, and info rows
  - Added: "Loading..." button state

### Configuration
- **`constants.ts`** - Domain migration
- **`manifest.json`** - Domain migration + version bump
- **`background.ts`** - Comment update

---

## 🔌 API Integration Notes

The extension expects the following API endpoints to be available at `https://app.yena.ai/api/v1`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/integrations/extension/me` | GET | Auth check |
| `/integrations/linkedin/profiles/status` | GET | Check if candidate exists |
| `/integrations/linkedin/profiles` | POST | Save candidate |
| `/integrations/extension/jobs` | GET | Fetch available jobs |
| `/integrations/extension/stages` | GET | Fetch pipeline stages |
| `/integrations/extension/lists` | GET | Fetch candidate lists |

### Headers Expected
```
X-API-KEY: <user_api_key>
X-Client-Version: 1.0.0
Content-Type: application/json
```

### External Messaging
The extension listens for external messages from `app.yena.ai` via `chrome.runtime.onMessageExternal`. Currently supports:
- `PING` → Returns `{ success: true, version: '1.0.0', type: 'PONG' }`

---

## 🧪 Testing Recommendations

1. **Test profile loading on slow connections** - Retry logic should handle delayed DOM
2. **Test 1st-degree connections** - Email/phone scraping should work more reliably
3. **Test navigation between profiles** - No data should bleed between candidates
4. **Test on various LinkedIn URLs:**
   - Regular profiles: `/in/username`
   - Sales Navigator: `/sales/lead/`
   - Recruiter: `/talent/profile/`

---

## 📦 Build Output

```
dist/
├── index.html        (0.37 kB)
├── assets/popup.css  (55.42 kB)
├── background.js     (4.64 kB)
├── popup.js          (144.14 kB)
├── content.js        (217.57 kB)
└── manifest.json
```

---

## 🚀 Deployment

1. The `dist/` folder contains the production build
2. Upload to Chrome Web Store or load unpacked for testing
3. Users will need to refresh their extension to get updates
