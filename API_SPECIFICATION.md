# Yena Chrome Extension - Backend API Specification

> **Version**: 1.0.3  
> **Base URL**: `https://app.yena.ai/api/v1`  
> **Last Updated**: 2024-12-19

This document defines all API endpoints the Chrome extension requires. Use this as the contract between extension and backend.

---

## Authentication

All requests include:

| Header | Value | Notes |
|--------|-------|-------|
| `Content-Type` | `application/json` | |
| `x-api-key` | User's API key | **Lowercase required** |

---

## CORS Configuration

The backend MUST allow:

```javascript
const allowedOrigins = [
  'chrome-extension://hbhdkcglhalpghljjmgkfklInclpmica', // Production
  // Add development IDs as needed
];
```

**Required for all endpoints:**
- Handle `OPTIONS` preflight requests
- Allow headers: `Content-Type`, `x-api-key`
- Allow methods: `GET`, `POST`, `OPTIONS`

---

## Endpoints

### 1. Check Authentication

Validates the API key.

```
GET /integrations/extension/me
```

**Response (200):**
```json
{
  "user": { "id": "...", "email": "...", "name": "..." }
}
```

**Response (401/403):** Invalid API key

---

### 2. Get Jobs

Fetches available jobs for the dropdown.

```
GET /integrations/extension/jobs
```

**Response (200):**
```json
[
  {
    "id": "abc123",
    "title": "Software Engineer",
    "company": "Acme Inc"
  }
]
```

---

### 3. Get Stages

Fetches pipeline stages for the dropdown.

```
GET /integrations/extension/stages
```

**Response (200):**
```json
[
  {
    "id": "stage1",
    "name": "Applied",
    "color": "#4CAF50"
  }
]
```

---

### 4. Get Lists

Fetches candidate lists for the dropdown.

```
GET /integrations/extension/lists
```

**Response (200):**
```json
[
  {
    "id": "list1",
    "name": "Frontend Engineers",
    "count": 42
  }
]
```

---

### 5. Check Candidate Status (Duplicate Detection)

Checks if a candidate already exists by LinkedIn URL.

```
GET /integrations/linkedin/profiles/status?sourceUrl={linkedin_url}
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `sourceUrl` | string | Full LinkedIn profile URL |

**Response (200):**
```json
{
  "exists": true,
  "candidateId": "abc123",
  "applications": ["jobId1", "jobId2"],
  "lists": ["listId1"]
}
```

**Deduplication Logic:**
- Normalize URL (strip query params, trailing slashes)
- Match against stored `linkedinUrl` or `email`

---

### 6. Save Candidate (Critical Endpoint)

Saves a new candidate or updates existing.

```
POST /integrations/linkedin/profiles
```

**Request Body:**
```json
{
  "profile": {
    "sourceUrl": "https://www.linkedin.com/in/john-doe/",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "headline": "Software Engineer at Acme",
    "location": "San Francisco, CA",
    "currentCompany": "Acme Inc",
    "email": "",
    "phone": "",
    "profilePictureUrl": "https://media.licdn.com/...",
    "experience": [
      {
        "title": "Software Engineer",
        "company": "Acme Inc",
        "startDate": "2020",
        "endDate": "Present",
        "description": "..."
      }
    ],
    "education": [
      {
        "school": "MIT",
        "degree": "BS",
        "field": "Computer Science",
        "startDate": "2016",
        "endDate": "2020"
      }
    ],
    "skills": ["JavaScript", "React", "Node.js"]
  },
  "jobId": "optional-job-id",
  "stageId": "optional-stage-id",
  "listId": "optional-list-id"
}
```

**Field Mapping (Extension → Backend):**

| Extension Field | Backend Field | Type | Required |
|-----------------|---------------|------|----------|
| `profile.sourceUrl` | `linkedinUrl` | string | ✅ Yes |
| `profile.name.firstName` | `firstName` | string | ✅ Yes |
| `profile.name.lastName` | `lastName` | string | ✅ Yes |
| `profile.headline` | `headline` | string | No |
| `profile.location` | `location` | string | No |
| `profile.currentCompany` | `currentCompany` | string | No |
| `profile.email` | `email` | string | No |
| `profile.phone` | `phone` | string | No |
| `profile.profilePictureUrl` | `profilePicture` | string | No |
| `profile.experience` | `experience` | array | No |
| `profile.education` | `education` | array | No |
| `profile.skills` | `skills` | array | No |
| `jobId` | Link to job | string | No |
| `stageId` | Pipeline stage | string | No |
| `listId` | Add to list | string | No |

**Response (200/201):**
```json
{
  "success": true,
  "candidateId": "created-or-updated-id",
  "isNew": true
}
```

**Response (4xx/5xx):**
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## Backend Implementation Checklist

### Firestore Safety
- [ ] Sanitize payload: Replace `undefined` with `null` or omit
- [ ] Firestore throws on `undefined` values

### Robust Property Access
Handle both formats:
```javascript
// Extension might send either format
const firstName = profile.name?.firstName || profile.firstName || '';
```

### Route Precedence
Define API routes BEFORE catch-all:
```javascript
// API routes first
app.post('/api/v1/integrations/linkedin/profiles', handleSave);
app.get('/api/v1/integrations/extension/jobs', getJobs);
// ... other API routes

// Catch-all LAST
app.get('*', serveStaticApp);
```

### CORS Preflight
Handle OPTIONS for all routes:
```javascript
app.options('/api/v1/*', cors());
```

---

## Common Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| HTML instead of JSON | `Unexpected token '<'` | Route defined after catch-all, or CORS blocking |
| 404 Not Found | Endpoint doesn't respond | Route not deployed or wrong path |
| 500 Server Error | Backend crash | Check server logs for stack trace |
| `undefined` in Firestore | 500 error | Sanitize payload before write |
| Missing fields | Data not showing in app | Field name mismatch (see mapping table) |
| Profile picture missing | Photo not saved | Check `profilePictureUrl` is mapped to correct field |

---

## Testing Commands

### Test Auth
```bash
curl -X GET "https://app.yena.ai/api/v1/integrations/extension/me" \
  -H "x-api-key: YOUR_KEY"
```

### Test Jobs
```bash
curl -X GET "https://app.yena.ai/api/v1/integrations/extension/jobs" \
  -H "x-api-key: YOUR_KEY"
```

### Test Save
```bash
curl -X POST "https://app.yena.ai/api/v1/integrations/linkedin/profiles" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{"profile":{"sourceUrl":"https://linkedin.com/in/test","name":{"firstName":"Test","lastName":"User"}}}'
```

---

## Extension IDs

| Environment | Extension ID |
|-------------|--------------|
| Production (Chrome Web Store) | `hbhdkcglhalpghljjmgkfklInclpmica` |
| Development (Local) | Varies per install |

Add all relevant IDs to CORS allowlist.
