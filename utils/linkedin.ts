/**
 * Normalize LinkedIn URL for consistent matching.
 * Removes query params/hash and canonicalizes profile-like paths so
 * /in/{slug}/recent-activity/* resolves to /in/{slug}.
 */
export function normalizeLinkedInUrl(inputUrl: string): string {
  try {
    const parsed = new URL((inputUrl || '').trim());
    const segments = parsed.pathname.split('/').filter(Boolean);
    let canonicalPath = parsed.pathname;

    if (segments[0] === 'in' && segments[1]) {
      canonicalPath = `/in/${segments[1]}`;
    } else if (segments[0] === 'sales' && (segments[1] === 'lead' || segments[1] === 'people') && segments[2]) {
      const token = (segments[2] || '').split(',')[0];
      canonicalPath = `/sales/${segments[1]}/${token}`;
    } else if (segments[0] === 'talent' && segments[1] === 'profile' && segments[2]) {
      canonicalPath = `/talent/profile/${segments[2]}`;
    }

    if (canonicalPath.endsWith('/')) canonicalPath = canonicalPath.slice(0, -1);
    return `https://www.linkedin.com${canonicalPath}`;
  } catch {
    return (inputUrl || '').trim();
  }
}

export function extractLinkedInMemberId(inputUrl: string): string | null {
  const normalized = normalizeLinkedInUrl(inputUrl || '');

  const profileMatch = normalized.match(/\/in\/(A[A-Z][a-zA-Z0-9_-]{20,})/);
  if (profileMatch) return profileMatch[1];

  const salesMatch = normalized.match(/\/sales\/(?:lead|people)\/([^/?#]+)/);
  if (!salesMatch) return null;

  const token = (salesMatch[1] || '').split(',')[0];
  if (/^A[A-Z][a-zA-Z0-9_-]{20,}$/.test(token)) return token;
  return null;
}

export function isProfileUrl(url: string): boolean {
  return url.includes('/in/') || url.includes('/sales/lead/') || url.includes('/sales/people/') || url.includes('/talent/profile/');
}
