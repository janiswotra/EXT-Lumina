# Release Notes - v1.0.24

**Release Date:** January 15, 2026
**Package:** `yena-extension-v1.0.24.zip` (145 KB)

---

## 🎉 New Features

### 1. Connection Degree Tracking
- **Captures** LinkedIn connection degree (1st, 2nd, 3rd, 1st+)
- **Displays** blue badge next to candidate name in Preview and Sidebar
- **Enables** relationship mapping between team members
- **Use Case:** Prioritize candidates based on connection strength

### 2. Additional Profile Sections
Now captures and displays:
- **Certifications** (name, issuer, issue date)
- **Courses** (name, institution)
- **Organizations** (name, role)
- **Languages** (expanded support)

All new sections appear **collapsed by default** below Skills section in the Sidebar.

---

## 🐛 Bug Fixes

### Critical Parser Fixes
1. **Fixed duplicate Preview component rendering**
   - Race condition in content script injection
   - Added `isInjecting` guard flag to prevent concurrent injections

2. **Fixed experience parser**
   - ❌ OLD: Read "Full-time" as company name
   - ✅ NEW: Filters out employment types (Full-time, Part-time, Contract, etc.)
   - ❌ OLD: Read "On-site" as job title
   - ✅ NEW: Filters out work location types (On-site, Remote, Hybrid)
   - ✅ NEW: Correctly extracts company from "Title at Company" format

3. **Fixed job title display in Preview**
   - Now uses structured Experience section data exclusively
   - Removed unreliable headline parsing fallback

---

## 🔧 Technical Improvements

### Parser Enhancements
- **Employment Type Filtering:** Full-time, Part-time, Contract, Freelance, Internship, Self-employed, Seasonal, Temporary
- **Location Type Filtering:** On-site, Remote, Hybrid
- **Smart Extraction:** Extracts company from "Title at Company" format automatically
- **Better Fallbacks:** Multiple strategies for finding connection degree badges

### UI Improvements
- Connection degree badges use LinkedIn-style blue color scheme
- Certifications use green indicator dots
- All new sections use consistent card styling
- Improved spacing and visual hierarchy

---

## 📦 What's Included

### Extension Files
- `manifest.json` - v1.0.24
- `content.js` - Enhanced parser with new sections
- `background.js` - Updated message handlers
- `popup.js` - Extension popup
- `contentApp.js` - Web app integration (v1.0.24)
- All assets and icons

### Documentation
1. **NEW_PROFILE_SECTIONS.md**
   - Complete integration guide for certifications, courses, organizations
   - Database schema options (JSONB vs relational)
   - Frontend UI examples
   - API payload examples

2. **CONNECTION_DEGREE_INTEGRATION.md**
   - Integration guide for connection degree feature
   - Use cases and examples
   - Relationship mapping strategies

3. **CORS_FIX_FOR_BACKEND.md**
   - Backend CORS configuration for Chrome extensions
   - Examples in Node.js, Python, Go, Ruby, Java, PHP
   - Google Cloud Run specific configs

---

## 🚀 Installation

### For Testing (Development)
1. Unzip `yena-extension-v1.0.24.zip`
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the unzipped `dist` folder

### For Production (Chrome Web Store)
Upload `yena-extension-v1.0.24.zip` to Chrome Web Store Developer Dashboard

---

## 📊 API Changes

### New Fields in Profile Payload

```typescript
interface CandidateProfile {
  // ... existing fields ...

  connectionDegree?: string;      // "1st", "2nd", "3rd", "1st+"
  certifications?: Certification[]; // [{name, issuer, issueDate}]
  courses?: Course[];              // [{name, institution}]
  organizations?: Organization[];  // [{name, role}]
}
```

### Example Payload
```json
{
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "connectionDegree": "1st",
    "certifications": [
      {
        "name": "AWS Certified Solutions Architect",
        "issuer": "Amazon Web Services",
        "issueDate": "2023"
      }
    ],
    "courses": [
      {
        "name": "Machine Learning Specialization",
        "institution": "Stanford University"
      }
    ],
    "organizations": [
      {
        "name": "Entrepreneurs' Organization",
        "role": "Member"
      }
    ]
  }
}
```

---

## ✅ Backend Integration Required

### Phase 1: Database (Required)
```sql
-- Option 1: JSONB Columns (Recommended for simplicity)
ALTER TABLE candidates
ADD COLUMN connection_degree VARCHAR(10),
ADD COLUMN certifications JSONB DEFAULT '[]',
ADD COLUMN courses JSONB DEFAULT '[]',
ADD COLUMN organizations JSONB DEFAULT '[]';

-- Option 2: Relational Tables (See NEW_PROFILE_SECTIONS.md)
```

### Phase 2: API Endpoint (Required)
Update API to accept and store new fields:
- `connectionDegree`
- `certifications`
- `courses`
- `organizations`

See `NEW_PROFILE_SECTIONS.md` for complete implementation guide.

### Phase 3: Frontend Display (Optional)
Add UI components to display new sections in candidate detail views.

---

## 🧪 Testing Checklist

**Basic Functionality:**
- [ ] Extension loads without errors
- [ ] Preview card appears on LinkedIn profiles
- [ ] Connection degree badge displays correctly
- [ ] Save candidate to Yena works
- [ ] All fields are captured and sent to API

**New Features:**
- [ ] Connection degree badge shows "1st", "2nd", or "3rd"
- [ ] Certifications section appears (if candidate has certs)
- [ ] Courses section appears (if candidate has courses)
- [ ] Organizations section appears (if candidate has orgs)
- [ ] All sections are collapsed by default

**Bug Fixes:**
- [ ] Preview component appears only once (not duplicated)
- [ ] Job title displays correctly (not company name)
- [ ] Company name displays correctly (not "Full-time")
- [ ] No employment types appear in wrong fields

---

## 🔄 Backward Compatibility

✅ **Fully backward compatible**
- All new fields are optional
- Extension sends empty arrays if sections don't exist
- Old API endpoints continue to work
- No breaking changes

---

## 📈 Metrics

**Code Changes:**
- 16 files changed
- 2,162 insertions
- 595 deletions

**Bundle Size:**
- content.js: 241.66 KB (was 236.72 KB) - +4.94 KB for new features
- Total extension: 145 KB zipped

---

## 🐞 Known Issues

None at this time.

---

## 📞 Support

**For Integration Help:**
- See `NEW_PROFILE_SECTIONS.md` for detailed backend integration guide
- See `CONNECTION_DEGREE_INTEGRATION.md` for connection degree integration
- See `CORS_FIX_FOR_BACKEND.md` for CORS configuration

**For Bug Reports:**
- GitHub: [Your repo URL]
- Email: [Your support email]

---

## 🔜 Next Steps

1. **Backend Team:**
   - Review `NEW_PROFILE_SECTIONS.md`
   - Update database schema
   - Update API endpoints
   - Deploy to staging for testing

2. **Frontend Team:**
   - Add connection degree badges to candidate cards
   - Add certifications/courses/organizations sections
   - Update search/filter if needed

3. **Testing:**
   - Test with various LinkedIn profiles
   - Verify all data flows correctly to main app
   - Test edge cases (empty sections, missing data)

4. **Production:**
   - Deploy backend changes
   - Test with live extension
   - Publish v1.0.24 to Chrome Web Store

---

## 🎯 Migration Path

**Immediate (Day 1):**
- Install extension v1.0.24
- Backend accepts new fields (don't reject if present)

**Week 1:**
- Backend stores new fields
- Test data flow end-to-end

**Week 2:**
- Frontend displays new sections
- Full feature rollout

---

**Version:** 1.0.24
**Build Date:** January 15, 2026
**Compatible With:** Chrome, Edge, Brave (Chromium-based browsers)
