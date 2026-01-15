# Connection Degree Feature - Integration Guide

## Overview
The Chrome extension now captures LinkedIn connection degree information (1st, 2nd, 3rd degree connections) for each candidate profile. This enables relationship mapping and helps prioritize outreach based on connection strength.

---

## 1. API Payload Changes

### New Field Added to Candidate Profile
The extension now sends a `connectionDegree` field in the candidate profile data:

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
  connectionDegree?: string;  // 🆕 NEW FIELD
  experiences: Experience[];
  educations: Education[];
  skills: string[];
  languages: string[];
}
```

### Field Specification

**Field Name:** `connectionDegree`
**Type:** `string | undefined`
**Nullable:** Yes (optional field)

**Possible Values:**
- `"1st"` - Direct connection (1st degree)
- `"2nd"` - Friend of a friend (2nd degree)
- `"3rd"` - 3rd degree connection
- `"1st+"` - 1st degree with additional context (LinkedIn sometimes shows this)
- `""` (empty string) or `undefined` - Connection degree not available

**When Available:**
- ✅ Regular LinkedIn profiles (linkedin.com/in/*)
- ✅ Sales Navigator profiles (linkedin.com/sales/lead/*)
- ❌ Profiles viewed while logged out
- ❌ Profiles that don't display connection badges

---

## 2. Database Schema Changes

### Recommended Database Field

Add this field to your `candidates` or `profiles` table:

```sql
ALTER TABLE candidates
ADD COLUMN connection_degree VARCHAR(10) NULL;

-- Index for filtering/sorting by connection degree
CREATE INDEX idx_candidates_connection_degree
ON candidates(connection_degree);
```

**Notes:**
- Use `VARCHAR(10)` to accommodate future values LinkedIn might introduce
- Make it nullable since not all profiles will have this data
- Consider adding an index if you plan to filter/sort by this field

---

## 3. API Endpoint Updates

### POST /api/candidates (or your equivalent endpoint)

**Example Request Payload:**
```json
{
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "headline": "Software Engineer at Tech Corp",
    "location": "San Francisco, CA",
    "linkedinUrl": "https://www.linkedin.com/in/johndoe/",
    "currentCompany": "Tech Corp",
    "connectionDegree": "1st",
    "email": "john@example.com",
    "phone": "+1-555-0123",
    "experiences": [...],
    "educations": [...],
    "skills": [...],
    "languages": [...]
  },
  "jobId": "job_123",
  "stageId": "stage_456",
  "listId": "list_789"
}
```

### Backend Processing

```typescript
// Example: Node.js/Express handler
app.post('/api/candidates', async (req, res) => {
  const { profile, jobId, stageId, listId } = req.body;

  // Validate connection degree if present
  const validDegrees = ['1st', '2nd', '3rd', '1st+', ''];
  if (profile.connectionDegree && !validDegrees.includes(profile.connectionDegree)) {
    // Log warning but don't reject - might be a new format
    console.warn('Unexpected connection degree:', profile.connectionDegree);
  }

  // Store in database
  const candidate = await db.candidates.create({
    first_name: profile.firstName,
    last_name: profile.lastName,
    headline: profile.headline,
    location: profile.location,
    linkedin_url: profile.linkedinUrl,
    current_company: profile.currentCompany,
    connection_degree: profile.connectionDegree || null,  // Store as NULL if not provided
    email: profile.email,
    phone: profile.phone,
    // ... other fields
  });

  res.json({ success: true, candidateId: candidate.id });
});
```

---

## 4. Frontend Display

### UI Badge Component (React Example)

```tsx
// ConnectionDegreeBadge.tsx
interface Props {
  degree?: string;
  size?: 'sm' | 'md';
}

export const ConnectionDegreeBadge: React.FC<Props> = ({ degree, size = 'md' }) => {
  if (!degree) return null;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1'
  };

  const colorClasses = {
    '1st': 'bg-blue-100 text-blue-700 border-blue-200',
    '1st+': 'bg-blue-100 text-blue-700 border-blue-200',
    '2nd': 'bg-gray-100 text-gray-700 border-gray-200',
    '3rd': 'bg-gray-50 text-gray-600 border-gray-200',
  };

  const colors = colorClasses[degree as keyof typeof colorClasses] || colorClasses['3rd'];

  return (
    <span className={`inline-flex items-center rounded-md border font-medium ${sizeClasses[size]} ${colors}`}>
      {degree}
    </span>
  );
};
```

### Usage in Candidate Cards

```tsx
// CandidateCard.tsx
import { ConnectionDegreeBadge } from './ConnectionDegreeBadge';

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  connectionDegree?: string;
  // ... other fields
}

export const CandidateCard: React.FC<{ candidate: Candidate }> = ({ candidate }) => {
  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <h3>{candidate.firstName} {candidate.lastName}</h3>
        <ConnectionDegreeBadge degree={candidate.connectionDegree} />
      </div>
      {/* ... rest of card */}
    </div>
  );
};
```

---

## 5. Features to Implement

### A. Filtering by Connection Degree

Allow users to filter candidates by connection strength:

```tsx
// Filter UI Example
<select onChange={(e) => filterByDegree(e.target.value)}>
  <option value="">All Connections</option>
  <option value="1st">1st Degree Only</option>
  <option value="2nd">2nd Degree</option>
  <option value="3rd">3rd Degree</option>
</select>
```

**API Endpoint:**
```
GET /api/candidates?connectionDegree=1st
```

### B. Sorting by Connection Strength

Allow sorting candidates by connection proximity:

**Sort Order:**
1. `1st` / `1st+` (closest)
2. `2nd` (medium)
3. `3rd` (distant)
4. `null` / `""` (unknown - last)

```sql
-- SQL example
SELECT * FROM candidates
ORDER BY
  CASE connection_degree
    WHEN '1st' THEN 1
    WHEN '1st+' THEN 1
    WHEN '2nd' THEN 2
    WHEN '3rd' THEN 3
    ELSE 4
  END,
  created_at DESC;
```

### C. Analytics Dashboard

Track connection degree distribution:

```typescript
// Analytics endpoint
GET /api/analytics/connection-degrees

Response:
{
  "1st": 45,
  "2nd": 123,
  "3rd": 67,
  "unknown": 12
}
```

Display as a pie chart or bar graph to show relationship network strength.

### D. Relationship Mapping

**Use Case:** Show which team member knows which candidates

If you store `uploadedBy` or `teamMemberId` with each candidate:

```sql
SELECT
  team_members.name,
  COUNT(CASE WHEN candidates.connection_degree = '1st' THEN 1 END) as first_degree_connections,
  COUNT(CASE WHEN candidates.connection_degree = '2nd' THEN 1 END) as second_degree_connections
FROM candidates
JOIN team_members ON candidates.uploaded_by = team_members.id
GROUP BY team_members.id;
```

This shows which colleagues have the strongest networks.

---

## 6. Migration Guide for Existing Data

### For Existing Candidates Without Connection Degree

**Option 1: Leave as NULL**
- Acceptable approach - NULL means "not captured"
- Extension will populate it going forward

**Option 2: Backfill via Extension**
- Use the "Check for Updates" feature in extension
- Extension will re-scrape profiles and update connection degrees

**Migration Script Example:**
```javascript
// Mark existing candidates as needing update
UPDATE candidates
SET needs_connection_degree_update = TRUE
WHERE connection_degree IS NULL
  AND linkedin_url IS NOT NULL;
```

---

## 7. Best Practices

### ✅ DO:
- Store as nullable field - not all profiles have this data
- Validate values but don't reject unknown formats (LinkedIn may add new ones)
- Index the field if you plan to filter/sort by it
- Display prominently in UI - it's valuable for outreach prioritization
- Use it for relationship mapping between team members

### ❌ DON'T:
- Don't make it a required field
- Don't assume all candidates will have it
- Don't block candidate creation if value is invalid
- Don't expose connection degree in public-facing pages (privacy concern)

---

## 8. Testing

### Test Cases

**Test Case 1: 1st Degree Connection**
```json
{
  "connectionDegree": "1st",
  // Expected: Badge shows "1st", filters work, sorts to top
}
```

**Test Case 2: 2nd Degree Connection**
```json
{
  "connectionDegree": "2nd",
  // Expected: Badge shows "2nd", appears in filters
}
```

**Test Case 3: Missing Connection Degree**
```json
{
  "connectionDegree": null,
  // Expected: No badge shown, no errors, sorts to bottom
}
```

**Test Case 4: Unknown Future Value**
```json
{
  "connectionDegree": "4th",
  // Expected: Store it, log warning, display generically
}
```

---

## 9. Privacy & Compliance

### Important Notes

⚠️ **Connection degree is LinkedIn data** - respect privacy:

- Only visible to authenticated users within your system
- Don't expose in public APIs or exported CSV files without permission
- Consider it PII (Personally Identifiable Information) in some jurisdictions
- Include in data deletion requests (GDPR right to be forgotten)

---

## 10. Support & Questions

### Extension Version
- Feature added in: **v1.0.23**
- Available for: LinkedIn + Sales Navigator profiles

### Common Questions

**Q: What if connection degree is empty?**
A: This is normal - profile might not display connection info. Store as NULL.

**Q: Should I backfill existing candidates?**
A: Optional. Use extension's "Check for Updates" feature if needed.

**Q: Can connection degree change over time?**
A: Yes! If user connects with candidate, it changes from 2nd→1st. Consider re-scraping periodically.

**Q: What does "1st+" mean?**
A: LinkedIn sometimes shows "1st+" for direct connections with additional context (e.g., same company).

---

## 11. Example Implementation Checklist

- [ ] Update database schema (add `connection_degree` column)
- [ ] Update API endpoint to accept and store `connectionDegree` field
- [ ] Add validation (warn on unknown values, don't reject)
- [ ] Create UI badge component
- [ ] Display badge in candidate cards/lists
- [ ] Add filter by connection degree
- [ ] Add sort by connection degree
- [ ] Update analytics dashboard (optional)
- [ ] Test with all connection degree values
- [ ] Update API documentation
- [ ] Deploy to staging environment
- [ ] Test with live extension data
- [ ] Deploy to production

---

## Contact

For questions about this feature or integration issues, contact the extension development team.

**Extension Repository:** [Your repo URL]
**API Documentation:** [Your API docs URL]
