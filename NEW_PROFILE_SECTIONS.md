# New Profile Sections - Integration Guide

## Overview
The Chrome extension now captures additional LinkedIn profile sections: **Certifications**, **Courses**, **Organizations**, and **Languages** (expanded).

Version: **v1.0.24** (upcoming)

---

## 1. API Payload Changes

### New Fields Added to Candidate Profile

```typescript
interface CandidateProfile {
  firstName: string;
  lastName: string;
  headline: string;
  location: string;
  linkedinUrl: string;
  currentCompany?: string;
  about?: string;
  profilePictureUrl?: string;
  email?: string;
  phone?: string;
  connectionDegree?: string;
  experiences: Experience[];
  educations: Education[];
  skills: string[];
  languages: string[];

  // 🆕 NEW FIELDS
  certifications?: Certification[];
  courses?: Course[];
  organizations?: Organization[];
}
```

### New Type Definitions

**Certification:**
```typescript
interface Certification {
  name: string;          // e.g., "AWS Certified Solutions Architect"
  issuer?: string;       // e.g., "Amazon Web Services"
  issueDate?: string;    // e.g., "2023" or "Jan 2023"
}
```

**Course:**
```typescript
interface Course {
  name: string;          // e.g., "Machine Learning Specialization"
  institution?: string;  // e.g., "Stanford University (via Coursera)"
}
```

**Organization:**
```typescript
interface Organization {
  name: string;          // e.g., "Entrepreneurs' Organization"
  role?: string;         // e.g., "Board Member"
}
```

---

## 2. Example API Payload

### POST /api/v1/integrations/linkedin/profiles

```json
{
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "headline": "Senior Software Engineer at Tech Corp",
    "location": "San Francisco, CA",
    "linkedinUrl": "https://www.linkedin.com/in/johndoe/",
    "currentCompany": "Tech Corp",
    "connectionDegree": "1st",
    "email": "john@example.com",
    "phone": "+1-555-0123",
    "experiences": [...],
    "educations": [...],
    "skills": ["JavaScript", "React", "Node.js"],
    "languages": ["English", "Spanish"],

    "certifications": [
      {
        "name": "AWS Certified Solutions Architect - Professional",
        "issuer": "Amazon Web Services (AWS)",
        "issueDate": "2023"
      },
      {
        "name": "Certified Kubernetes Administrator (CKA)",
        "issuer": "The Linux Foundation",
        "issueDate": "Jan 2024"
      }
    ],

    "courses": [
      {
        "name": "Machine Learning Specialization",
        "institution": "Stanford University"
      },
      {
        "name": "Advanced React Patterns",
        "institution": "Frontend Masters"
      }
    ],

    "organizations": [
      {
        "name": "Entrepreneurs' Organization (EO)",
        "role": "Member"
      },
      {
        "name": "Open Source Initiative",
        "role": "Contributor"
      }
    ]
  },
  "jobId": "job_123",
  "stageId": "stage_456"
}
```

---

## 3. Database Schema Updates

### Add New Tables

```sql
-- Certifications table
CREATE TABLE candidate_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    issuer VARCHAR(255),
    issue_date VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidate_certifications_candidate_id ON candidate_certifications(candidate_id);

-- Courses table
CREATE TABLE candidate_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    institution VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidate_courses_candidate_id ON candidate_courses(candidate_id);

-- Organizations table
CREATE TABLE candidate_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_candidate_organizations_candidate_id ON candidate_organizations(candidate_id);
```

### Alternative: JSON Column Approach (Simpler)

If you prefer simpler schema without relations:

```sql
ALTER TABLE candidates
ADD COLUMN certifications JSONB DEFAULT '[]',
ADD COLUMN courses JSONB DEFAULT '[]',
ADD COLUMN organizations JSONB DEFAULT '[]';

-- Add GIN indexes for JSONB searching (optional, for filtering)
CREATE INDEX idx_candidates_certifications ON candidates USING GIN (certifications);
CREATE INDEX idx_candidates_courses ON candidates USING GIN (courses);
CREATE INDEX idx_candidates_organizations ON candidates USING GIN (organizations);
```

**Recommendation:** Use **JSON column approach** for simplicity unless you need advanced querying/filtering on these fields.

---

## 4. API Endpoint Implementation

### Backend Handler Example (Node.js/Express)

```typescript
app.post('/api/v1/integrations/linkedin/profiles', async (req, res) => {
  const { profile, jobId, stageId, listId } = req.body;

  try {
    // Save candidate
    const candidate = await db.candidates.create({
      first_name: profile.firstName,
      last_name: profile.lastName,
      headline: profile.headline,
      location: profile.location,
      linkedin_url: profile.linkedinUrl,
      current_company: profile.currentCompany,
      connection_degree: profile.connectionDegree || null,
      email: profile.email,
      phone: profile.phone,
      skills: profile.skills || [],
      languages: profile.languages || [],

      // 🆕 NEW FIELDS (JSONB approach)
      certifications: profile.certifications || [],
      courses: profile.courses || [],
      organizations: profile.organizations || [],

      // ... other fields
    });

    // If using relational tables instead:
    // await saveCertifications(candidate.id, profile.certifications);
    // await saveCourses(candidate.id, profile.courses);
    // await saveOrganizations(candidate.id, profile.organizations);

    res.json({
      success: true,
      candidateId: candidate.id
    });

  } catch (error) {
    console.error('Error saving candidate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save candidate'
    });
  }
});
```

---

## 5. Frontend Display

### Certification Badge Component

```tsx
// CertificationBadge.tsx
interface Certification {
  name: string;
  issuer?: string;
  issueDate?: string;
}

export const CertificationBadge: React.FC<{ cert: Certification }> = ({ cert }) => {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{cert.name}</p>
        {cert.issuer && (
          <p className="text-xs text-gray-600 mt-0.5">{cert.issuer}</p>
        )}
        {cert.issueDate && (
          <p className="text-xs text-gray-500 mt-0.5">Issued: {cert.issueDate}</p>
        )}
      </div>
    </div>
  );
};
```

### Usage in Candidate Detail View

```tsx
// CandidateDetail.tsx
import { CertificationBadge } from './CertificationBadge';

export const CandidateDetail: React.FC<{ candidate: Candidate }> = ({ candidate }) => {
  return (
    <div className="space-y-6">
      {/* ... existing sections ... */}

      {/* Certifications Section */}
      {candidate.certifications && candidate.certifications.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Certifications ({candidate.certifications.length})
          </h3>
          <div className="space-y-2">
            {candidate.certifications.map((cert, i) => (
              <CertificationBadge key={i} cert={cert} />
            ))}
          </div>
        </div>
      )}

      {/* Courses Section */}
      {candidate.courses && candidate.courses.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Courses ({candidate.courses.length})
          </h3>
          <div className="space-y-2">
            {candidate.courses.map((course, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-900">{course.name}</p>
                {course.institution && (
                  <p className="text-xs text-gray-600 mt-0.5">{course.institution}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Organizations Section */}
      {candidate.organizations && candidate.organizations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Organizations ({candidate.organizations.length})
          </h3>
          <div className="space-y-2">
            {candidate.organizations.map((org, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-900">{org.name}</p>
                {org.role && (
                  <p className="text-xs text-gray-600 mt-0.5">{org.role}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

---

## 6. Features to Implement

### A. Search & Filter

**Use Case:** Find candidates with specific certifications

```sql
-- JSON column approach
SELECT * FROM candidates
WHERE certifications @> '[{"name": "AWS Certified"}]'::jsonb;

-- Or search within certification names
SELECT * FROM candidates
WHERE certifications::text ILIKE '%AWS%';
```

**API Endpoint:**
```
GET /api/candidates?certification=AWS
```

### B. Analytics

**Track most common certifications:**
```sql
SELECT
  cert->>'name' as certification_name,
  COUNT(*) as candidate_count
FROM candidates,
LATERAL jsonb_array_elements(certifications) AS cert
GROUP BY cert->>'name'
ORDER BY candidate_count DESC
LIMIT 10;
```

### C. Candidate Scoring

**Boost candidates with relevant certifications:**
```typescript
// Scoring algorithm example
function calculateCandidateScore(candidate: Candidate, job: Job): number {
  let score = 0;

  // Base score from experience
  score += candidate.experiences.length * 10;

  // Bonus for relevant certifications
  const relevantCerts = candidate.certifications?.filter(cert =>
    job.requiredCertifications?.includes(cert.name)
  );
  score += (relevantCerts?.length || 0) * 20;

  // Bonus for organizations
  score += (candidate.organizations?.length || 0) * 5;

  return score;
}
```

---

## 7. Data Availability

### When Fields are Populated

| Field | Always? | Notes |
|-------|---------|-------|
| `certifications` | ❌ No | Only if candidate has certifications on LinkedIn |
| `courses` | ❌ No | Only if candidate lists courses |
| `organizations` | ❌ No | Only if candidate lists organizations |
| `languages` | ✅ Often | Most profiles have language info |

**Default Values:**
- Extension sends empty arrays `[]` if sections don't exist
- Backend should store as empty arrays (JSONB) or not create rows (relational)

---

## 8. Backward Compatibility

### Handling Old Data

**For existing candidates without these fields:**

```sql
-- Set default empty arrays for existing records (JSONB approach)
UPDATE candidates
SET
  certifications = '[]'::jsonb,
  courses = '[]'::jsonb,
  organizations = '[]'::jsonb
WHERE certifications IS NULL;
```

**Frontend handling:**
```typescript
// Always check if fields exist
const certifications = candidate.certifications || [];
const courses = candidate.courses || [];
const organizations = candidate.organizations || [];
```

---

## 9. Migration Checklist

**Phase 1: Backend (Required)**
- [ ] Update database schema (add JSONB columns or new tables)
- [ ] Update API endpoint to accept new fields
- [ ] Update transform layer (camelCase ↔ snake_case)
- [ ] Test with sample payload
- [ ] Deploy to staging

**Phase 2: Frontend (Nice to Have)**
- [ ] Add certification badges to candidate cards
- [ ] Add courses section to detail view
- [ ] Add organizations section to detail view
- [ ] Update search/filter if needed
- [ ] Deploy to staging

**Phase 3: Production**
- [ ] Run migration on production database
- [ ] Deploy API changes
- [ ] Deploy frontend changes
- [ ] Test with live extension data

---

## 10. Testing

### Test Payloads

**Test Case 1: Full Profile with All Sections**
```json
{
  "certifications": [
    {"name": "PMP", "issuer": "PMI", "issueDate": "2023"},
    {"name": "Scrum Master", "issuer": "Scrum Alliance"}
  ],
  "courses": [
    {"name": "Product Management", "institution": "Harvard Business School"}
  ],
  "organizations": [
    {"name": "Product Management Association", "role": "Member"}
  ]
}
```

**Test Case 2: Empty Sections**
```json
{
  "certifications": [],
  "courses": [],
  "organizations": []
}
```

**Test Case 3: Missing Fields (undefined)**
```json
{
  // certifications, courses, organizations not included
}
```

---

## 11. Priority

### Must Have (Phase 1)
✅ Backend accepts and stores the new fields
✅ No errors when fields are empty/missing

### Nice to Have (Phase 2)
🎨 Display in candidate detail view
🔍 Search/filter by certifications

### Future Enhancements (Phase 3)
📊 Analytics on common certifications
🎯 Certification matching for jobs
🏆 Candidate scoring based on certifications

---

## 12. Questions?

**Q: What if LinkedIn structure changes?**
A: Extension parser is resilient - if sections aren't found, it sends empty arrays.

**Q: Should we validate certification names?**
A: No - store as-is. LinkedIn data varies widely. Add validation later if needed.

**Q: How much data is this?**
A: Minimal. Average candidate has 2-3 certifications, 1-2 courses, 0-1 organizations.

**Q: Should we dedupe certifications across candidates?**
A: Not necessary initially. Add later if you want certification taxonomy/standardization.

---

## 13. Support

**Extension Version:** v1.0.24
**Changes:** Added certifications, courses, organizations parsing
**Documentation:** `NEW_PROFILE_SECTIONS.md`

For implementation questions, contact the extension development team.
