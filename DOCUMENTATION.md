# Yena Candidate Clipper - Chrome Extension

**Version:** 1.0.17
**Platform:** Chrome Extension (Manifest V3)

---

## Overview

Yena Candidate Clipper is a Chrome extension that enables recruiters to seamlessly capture candidate profiles from LinkedIn and LinkedIn Sales Navigator directly into the Yena ATS (Applicant Tracking System).

### Key Features

- One-click candidate profile capture from LinkedIn
- Support for LinkedIn Regular, Sales Navigator, and Recruiter views
- Real-time profile parsing (name, headline, experience, education, skills)
- Job pipeline assignment during capture
- List assignment for candidate organization
- Duplicate detection (shows "In Yena" badge for existing candidates)
- Contact info extraction for 1st-degree connections

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     LinkedIn Page                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Content Script (Shadow DOM)                ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ ││
│  │  │   Preview   │  │   Sidebar   │  │ LinkedInInjector│ ││
│  │  │    Card     │  │   (Full)    │  │   (Main App)    │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                    Chrome Message Passing
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Background Script                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   API       │  │   Auth      │  │   Storage           │ │
│  │   Client    │  │   Handler   │  │   Manager           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                         HTTPS API
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Yena API                               │
│                  (api.hireyena.com)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
EXT-Lumina/
├── manifest.json           # Extension manifest (V3)
├── background.ts           # Service worker - API communication
├── contentApp.ts           # Content script entry point
├── LinkedInInjector.tsx    # Main React component
├── index.css               # Tailwind CSS styles
├── types.ts                # TypeScript type definitions
│
├── components/
│   ├── Sidebar.tsx         # Full editor panel (480px)
│   ├── Preview.tsx         # Preview card (420px)
│   ├── AuthScreen.tsx      # API key connection screen
│   ├── Toast.tsx           # Notification component
│   ├── Button.tsx          # Reusable button component
│   └── ui/
│       ├── Input.tsx       # Form input component
│       └── PickerModal.tsx # Job/Stage/List selector modal
│
├── utils/
│   └── parser.ts           # LinkedIn DOM parsing utilities
│
├── icons/                  # Extension icons
└── dist/                   # Build output
```

---

## Key Components

### LinkedInInjector.tsx
Main orchestrator component that:
- Manages view state (hidden/preview/full)
- Detects URL changes for profile navigation
- Coordinates profile parsing
- Handles candidate existence checks

### Preview.tsx
Compact preview card showing:
- Candidate name and headline
- Current company and location
- Quick "Add to Yena" action
- "In Yena" badge for existing candidates

### Sidebar.tsx
Full editor panel featuring:
- Editable profile fields
- Job pipeline selector
- Stage assignment
- List assignment
- Experience/Education/Skills sections
- Save action with success feedback

### parser.ts
LinkedIn DOM parser supporting:
- Regular LinkedIn profiles (`/in/`)
- Sales Navigator profiles (`/sales/lead/`)
- Recruiter profiles (`/talent/profile/`)
- Experience extraction with descriptions
- Education parsing
- Skills collection
- Contact info scraping (1st-degree only)

---

## Message Types

Communication between content script and background:

| Type | Direction | Description |
|------|-----------|-------------|
| `CHECK_AUTH` | Content → BG | Verify API key validity |
| `SAVE_CANDIDATE` | Content → BG | Save profile to Yena |
| `CHECK_CANDIDATE_STATUS` | Content → BG | Check if candidate exists |
| `GET_JOBS` | Content → BG | Fetch available jobs |
| `GET_STAGES` | Content → BG | Fetch pipeline stages |
| `GET_LISTS` | Content → BG | Fetch candidate lists |
| `TRIGGER_SCRAPE` | BG → Content | Background scrape request |
| `PROFILE_DATA_EXTRACTED` | Content → BG | Scraped data response |

---

## Data Caching

The extension caches API responses to improve performance:

| Cache Key | Duration | Data |
|-----------|----------|------|
| `lumina_cache_jobs` | 1 hour | Jobs list |
| `lumina_cache_stages` | 1 hour | Pipeline stages |
| `lumina_cache_lists` | 1 hour | Candidate lists |

---

## URL Detection

Profile pages are detected via URL patterns:
- LinkedIn: `/in/{username}`
- Sales Navigator: `/sales/lead/{id}`
- Recruiter: `/talent/profile/{id}`

---

## Styling

The extension uses:
- **Tailwind CSS** for utility classes
- **Inter font** for typography
- **Attio-inspired** dark theme design
- **Shadow DOM** for style isolation from LinkedIn

### Color Palette
- Primary: `#864AFF` (Purple)
- Background: `#111113`
- Surface: `#1A1D21`
- Text Primary: `#EEEFF1`
- Text Secondary: `#A2A4A7`

---

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
npm install
```

### Build
```bash
npm run build
```

### Load Extension
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

### Watch Mode
```bash
npm run dev
```

---

## Version History

### v1.0.17 (Current)
- Expanded Preview width: 380px → 420px
- Expanded Sidebar width: 420px → 480px
- Improved InfoRow layout (vertical stacking)
- Removed debug console.log statements
- Experience descriptions now captured
- Skills section shows all skills (scrollable)

### v1.0.16
- Sales Navigator parser improvements
- Contact info extraction optimization

### v1.0.14
- Added About section scraping
- Experience descriptions parsing

### v1.0.13
- Disabled harvest feature (not synced with main app)

### v1.0.12
- Pipeline stage fix
- General cleanup

---

## API Integration

### Endpoints
Base URL: `https://api.hireyena.com`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/candidates` | POST | Create/update candidate |
| `/api/candidates/status` | POST | Check candidate existence |
| `/api/jobs` | GET | List available jobs |
| `/api/stages` | GET | List pipeline stages |
| `/api/lists` | GET | List candidate lists |

### Authentication
API key stored in `chrome.storage.local` as `lumina_api_key`.
Format: `lumina_sk_...`

**Important:** Ownership attribution (who "owns" imported contacts/candidates) is derived from the API key's user. Each teammate should use their own personal API key; if multiple people share one key, all imports will be attributed to that one user.

---

## Known Limitations

1. **Contact Info**: Only available for 1st-degree connections
2. **Rate Limiting**: LinkedIn may throttle rapid profile visits
3. **DOM Changes**: Parser may need updates if LinkedIn changes structure
4. **Sales Navigator**: Some fields may not be available in all views

---

## Troubleshooting

### Extension Context Invalid
If you see "Extension context invalidated" errors:
- Refresh the LinkedIn page
- The extension was likely updated while the tab was open

### Profile Not Parsing
If profile data is incomplete:
- Scroll down to load lazy-loaded content
- Wait for LinkedIn's dynamic content to render
- Check if you're on a supported profile URL

### API Connection Failed
If authentication fails:
- Verify API key in Yena settings
- Check network connectivity
- Ensure API key format is correct (`lumina_sk_...`)

---

## Support

For issues or feature requests, contact the Yena team.
