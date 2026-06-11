import { CandidateProfile, Experience, Education, Certification, Course, Organization } from '../../types';
import { getText, getSectionByTitle, getListItems, getVisualLines, parseDateRange, getConnectionDegree } from './shared';
import { parseSalesNavigatorProfile } from './salesNav';
import { isSalesNavigator } from './shared';

// Module-level constants for experience parsing
const EXP_EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'self-employed', 'seasonal', 'temporary'];
const EXP_WORK_LOCATION_TYPES = ['on-site', 'remote', 'hybrid'];

/**
 * Parses experience data from the lines of a single experience item.
 * Finds the date line as anchor, then extracts title/company above and location below.
 */
function parseExperienceItem(lines: string[]): Experience | null {
  const dateIdx = lines.findIndex(l => /\d{4}/.test(l) && /[-–]/.test(l));
  if (dateIdx < 0) return null;

  const dateLine = lines[dateIdx].split(' · ')[0].trim();
  const dates = parseDateRange(dateLine);

  let title = '';
  let company = '';
  let loc = '';

  // Walk backward from date for title and company
  let si = dateIdx - 1;

  // Skip duration lines ("3 yrs 9 mos") and work location types
  while (si >= 0) {
    const lower = lines[si].toLowerCase();
    if (/^\d+\s*(yr|mo)/i.test(lines[si]) || EXP_WORK_LOCATION_TYPES.includes(lower)) {
      si--;
      continue;
    }
    break;
  }

  if (si >= 0) {
    const prevLine = lines[si];
    // "Company · Full-time" pattern
    if (prevLine.includes('·') && EXP_EMPLOYMENT_TYPES.some(t => prevLine.toLowerCase().includes(t))) {
      company = prevLine.split('·')[0].trim();
      si--;
    } else if (EXP_EMPLOYMENT_TYPES.some(t => prevLine.toLowerCase() === t)) {
      // Bare employment type (grouped role — company comes from parent)
      si--;
    }
    if (si >= 0) {
      title = lines[si];
    }
  }

  // Look forward from date for location
  if (dateIdx + 1 < lines.length) {
    const nextLine = lines[dateIdx + 1];
    const nextLower = nextLine.toLowerCase();
    if (nextLine.length < 60 &&
      (EXP_WORK_LOCATION_TYPES.includes(nextLower) ||
        EXP_WORK_LOCATION_TYPES.some(w => nextLower.includes(w)) ||
        (nextLine.includes(',') && /^[A-Z]/.test(nextLine)))) {
      loc = nextLine.split(' · ')[0].trim();
    }
  }

  if (!title) return null;

  return {
    title, company,
    startDate: dates.startDate, endDate: dates.endDate,
    location: loc, description: ''
  };
}

export const parseProfile = (): CandidateProfile => {
  const url = window.location.href;

  // Detect Sales Navigator and route to specialized parser
  if (isSalesNavigator()) {
    return parseSalesNavigatorProfile();
  }

  // --- Regular LinkedIn Profile Parsing ---
  // --- 1. Basic Info ---

  const fullName = getText(document, 'h1.text-heading-xlarge') ||
    getText(document, '.text-heading-xlarge') ||
    getText(document, 'h1.t-24') ||
    getText(document, '.pv-text-details__left-panel h1') ||
    getText(document, '.pv-top-card h1') ||
    getText(document, 'main h1') ||
    // 2025/2026 LinkedIn layout: name moved to h2
    (() => {
      const h2s = Array.from(document.querySelectorAll('main h2, h2'));
      for (const h2 of h2s) {
        const text = h2.textContent?.trim() || '';
        if (!text || text.length < 3 || text.length > 50) continue;
        const words = text.split(' ');
        if (words.length < 2 || words.length > 5) continue;
        // Must look like a person name (capitalized words, no section headers)
        const sectionHeaders = ['about', 'experience', 'education', 'skills', 'languages', 'activity', 'interests', 'featured', 'certifications', 'licenses', 'recommendations', 'volunteering', 'organizations', 'people', 'you might', 'ad options', 'don\'t want', 'notifications'];
        if (sectionHeaders.some(h => text.toLowerCase().includes(h))) continue;
        if (/\d/.test(text)) continue;
        return text;
      }
      return '';
    })();

  let firstName = '';
  let lastName = '';

  if (fullName) {
    const parts = fullName.trim().split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  // ─── Extract headline and location ───
  // Strategy: old LinkedIn selectors first, with validation they don't return wrong data.
  // Then 2025/2026 fallback using text node analysis near the name element.

  const safeGetText = (selector: string): string => {
    const val = getText(document, selector);
    // Guard: old selectors sometimes return the person's name instead
    if (val && val !== fullName && !val.includes(fullName)) return val;
    return '';
  };

  let headline = safeGetText('.text-body-medium.break-words') ||
    safeGetText('[data-generated-suggestion-target="headline"]');

  let location = safeGetText('.text-body-small.inline.t-black--light.break-words') ||
    safeGetText('.pb2 .text-body-small');

  // 2025/2026 fallback: extract from text nodes near the name element
  if (!headline || !location) {
    const h2s = Array.from(document.querySelectorAll('main h2, h2'));
    let nameEl: Element | null = null;
    for (const h2 of h2s) {
      if (h2.textContent?.trim() === fullName) { nameEl = h2; break; }
    }

    if (nameEl) {
      // Walk up to find the top card container
      let topCard = nameEl.parentElement;
      for (let i = 0; i < 8 && topCard; i++) {
        const text = topCard.textContent || '';
        if (text.includes('Contact info') && text.includes(fullName)) break;
        topCard = topCard.parentElement;
      }

      if (topCard) {
        // Collect leaf text nodes (no children = actual visible text)
        const leafTexts: string[] = [];
        const allEls = Array.from(topCard.querySelectorAll('*'));
        for (const el of allEls) {
          if (el.children.length === 0) {
            const t = (el.textContent || '').trim();
            if (t && t.length > 1) leafTexts.push(t);
          }
        }

        // Deduplicate
        const seen = new Set<string>();
        const uniqueTexts = leafTexts.filter(t => {
          if (seen.has(t)) return false;
          seen.add(t);
          return true;
        });

        const skipWords = ['contact info', 'follower', 'connection', 'mutual', 'message', 'pending',
          'more', 'save', 'open', 'show', 'see all', 'get started', '·', '1st', '2nd', '3rd'];

        if (!headline) {
          for (const t of uniqueTexts) {
            if (t === fullName || t === firstName || t === lastName) continue;
            const lower = t.toLowerCase();
            if (skipWords.some(w => lower === w || lower.startsWith(w))) continue;
            // Headline is typically 20+ chars, descriptive text
            if (t.length >= 20 && t.length < 250 && !/^\d/.test(t)) {
              headline = t;
              break;
            }
          }
        }

        if (!location) {
          // Find "Contact info" in the text list, location is typically just before it
          const ciIndex = uniqueTexts.findIndex(t => t.toLowerCase() === 'contact info');
          if (ciIndex > 0) {
            const candidate = uniqueTexts[ciIndex - 1];
            if (candidate && candidate !== fullName && candidate !== headline &&
              candidate.length < 60 && candidate.length > 2) {
              location = candidate;
            }
          }

          // Alternative: look for short geographic-looking text
          if (!location) {
            for (const t of uniqueTexts) {
              if (t === fullName || t === headline) continue;
              const lower = t.toLowerCase();
              if (skipWords.some(w => lower === w || lower.startsWith(w))) continue;
              if (t.length >= 3 && t.length < 50 && /^[A-Z]/.test(t) &&
                !t.includes('BNI') && !t.includes('CEO') && !t.includes('Director') &&
                (t.includes(',') || t.match(/^[A-Z][a-z]+$/))) {
                location = t;
                break;
              }
            }
          }
        }
      }
    }
  }

  // --- Extract Current Company from Profile Header (Top Card) ---
  let currentCompanyFromHeader = '';

  // Strategy 1: Button element with company link in top card (2024/2025 layout)
  const companyButton = document.querySelector('button[aria-label*="Current company"]') as HTMLElement;
  if (companyButton) {
    currentCompanyFromHeader = companyButton.textContent?.trim() || '';
  }

  // Strategy 2: Link to company page in the top card section
  if (!currentCompanyFromHeader) {
    const topCardSection = document.querySelector('.pv-text-details__left-panel, .mt2.relative');
    if (topCardSection) {
      const companyLink = topCardSection.querySelector('a[href*="/company/"]') as HTMLAnchorElement;
      if (companyLink) {
        currentCompanyFromHeader = companyLink.textContent?.trim() || '';
      }
    }
  }

  // Strategy 3: Span with data attribute for experience section link in header
  if (!currentCompanyFromHeader) {
    const experienceLink = document.querySelector('[data-field="experience_company_logo"] + div span, button[id*="experience"] span[aria-hidden="true"]');
    if (experienceLink) {
      currentCompanyFromHeader = experienceLink.textContent?.trim() || '';
    }
  }

  // Strategy 4: Direct text from top card area (2024/2025 layout)
  if (!currentCompanyFromHeader) {
    const topCardTexts = document.querySelectorAll('.pv-text-details__left-panel ul li button span[aria-hidden="true"], .mt2 ul li button span[aria-hidden="true"]');
    for (const el of topCardTexts) {
      const text = el.textContent?.trim() || '';
      if (text &&
        !text.toLowerCase().includes('connection') &&
        !text.toLowerCase().includes('follower') &&
        !text.includes(' yr') &&
        !text.includes(' mo') &&
        text.length > 2 &&
        text.length < 100) {
        currentCompanyFromHeader = text;
        break;
      }
    }
  }

  // Strategy 5 (2025/2026): Find company from top card leaf texts
  // Pattern: "Company · Education" or just "Company" — text between headline and location
  if (!currentCompanyFromHeader) {
    const h2s = Array.from(document.querySelectorAll('main h2, h2'));
    let nameEl: Element | null = null;
    for (const h2 of h2s) {
      if (h2.textContent?.trim() === fullName) { nameEl = h2; break; }
    }
    if (nameEl) {
      let topCard = nameEl.parentElement;
      for (let i = 0; i < 8 && topCard; i++) {
        if ((topCard.textContent || '').includes('Contact info')) break;
        topCard = topCard.parentElement;
      }
      if (topCard) {
        const leafTexts: string[] = [];
        const allEls = Array.from(topCard.querySelectorAll('*'));
        for (const el of allEls) {
          if (el.children.length === 0) {
            const t = (el.textContent || '').trim();
            if (t && t.length > 1) leafTexts.push(t);
          }
        }
        // Look for a text that's between headline and location — contains "·" separator
        // like "BNI Latvija · Rigas Tehniska Universitate"
        for (const t of leafTexts) {
          if (t === fullName || t === headline || t === location) continue;
          if (t.startsWith('·')) continue; // skip "· 1st" etc.
          if (t.length < 3 || t.length > 120) continue;
          const lower = t.toLowerCase();
          if (lower.includes('follower') || lower.includes('connection') ||
            lower.includes('contact info') || lower.includes('message') ||
            lower.includes('mutual') || /^\d/.test(t)) continue;
          // This is likely "Company · Education" or "Company"
          if (t.includes(' · ')) {
            currentCompanyFromHeader = t.split(' · ')[0].trim();
          } else {
            currentCompanyFromHeader = t;
          }
          break;
        }
      }
    }
  }

  // Strategy 6: Company links with /company/ in href
  if (!currentCompanyFromHeader) {
    const companyLinks = Array.from(document.querySelectorAll('main a[href*="/company/"]'));
    for (const link of companyLinks) {
      const text = link.textContent?.trim() || '';
      if (text && text.length > 1 && text.length < 80 &&
        !text.toLowerCase().includes('follower')) {
        currentCompanyFromHeader = text;
        break;
      }
    }
  }

  // Profile Picture - Strategy 1: Open Graph Meta Tag (Most stable, public URL)
  let profilePictureUrl = '';

  const metaImage = document.querySelector('meta[property="og:image"]') ||
    document.querySelector('meta[name="image"]') ||
    document.querySelector('meta[property="image"]');

  if (metaImage) {
    const content = metaImage.getAttribute('content');
    if (content &&
      content.startsWith('http') &&
      !content.includes('ghost') &&
      !content.includes('li_ghost') &&
      !content.includes('unavailable')) {
      profilePictureUrl = content;
    }
  }

  // Strategy 2: DOM Selectors (Fallback)
  if (!profilePictureUrl) {
    const pictureSelectors = [
      'img.pv-top-card-profile-picture__image--show',
      'img.pv-top-card-profile-picture__image',
      'img.profile-photo-edit__preview',
      '.pv-top-card-profile-picture img',
      '.pv-top-card--photo img',
      'img.presence-entity__image',
      'img.EntityPhoto-circle-9',
      'img.EntityPhoto-circle-8',
      'button.pv-top-card-profile-picture img',
      '.profile-topcard-person-entity__image img',
      '.artdeco-entity-lockup__image img',
      '.pv-top-card img[width="200"]',
      '.pv-top-card img[width="160"]',
      '.pv-top-card img[height="200"]',
      'img[alt*="profile photo" i]',
      'img[alt*="photo" i][class*="profile"]'
    ];

    const isValidProfileImg = (src: string): boolean =>
      !!src &&
      src.startsWith('http') &&
      !src.includes('data:image') &&
      !src.startsWith('blob:') &&
      !src.includes('ghost') &&
      !src.includes('li_ghost') &&
      !src.includes('placeholder') &&
      !src.includes('static.licdn.com/aero-v1/sc/h/') &&
      !src.includes('unavailable') &&
      !src.includes('displaybackground');

    for (const selector of pictureSelectors) {
      const imgEl = document.querySelector(selector) as HTMLImageElement;
      if (imgEl?.src && isValidProfileImg(imgEl.src)) {
        profilePictureUrl = imgEl.src;
        break;
      }
    }

    // Strategy 3: Find img with person's name in alt text (2025/2026 layout)
    if (!profilePictureUrl && fullName) {
      const allImgs = document.querySelectorAll('main img, [class*="top-card"] img, header img');
      for (const img of allImgs) {
        const imgEl = img as HTMLImageElement;
        const alt = imgEl.alt || '';
        if (alt.includes(fullName) || alt.includes(firstName)) {
          if (imgEl.src && isValidProfileImg(imgEl.src)) {
            profilePictureUrl = imgEl.src;
            break;
          }
        }
      }
    }

    // Strategy 4: Large media.licdn.com image in header area
    if (!profilePictureUrl) {
      const headerImgs = document.querySelectorAll('main img[src*="media.licdn.com"], main img[src*="profile-displayphoto"]');
      for (const img of headerImgs) {
        const imgEl = img as HTMLImageElement;
        if (imgEl.src && isValidProfileImg(imgEl.src) &&
          (imgEl.width >= 80 || imgEl.height >= 80 || imgEl.getAttribute('width') === '200')) {
          // Skip banner images (much wider than tall)
          if (imgEl.width > 0 && imgEl.height > 0 && imgEl.width > imgEl.height * 2) continue;
          profilePictureUrl = imgEl.src;
          break;
        }
      }
    }

    // Strategy 5: Button wrapping profile photo
    if (!profilePictureUrl) {
      const photoButton = document.querySelector('button.pv-top-card-profile-picture--photo, button[aria-label*="photo" i], button[aria-label*="picture" i]') as HTMLElement;
      if (photoButton) {
        const bgImg = photoButton.querySelector('img') as HTMLImageElement;
        if (bgImg?.src && isValidProfileImg(bgImg.src)) {
          profilePictureUrl = bgImg.src;
        }
      }
    }
  }

  // --- 2. About Section ---
  let about = '';
  const aboutSection = getSectionByTitle('About');
  if (aboutSection) {
    // Strategy 1: Classic LinkedIn span[aria-hidden="true"]
    const aboutText = aboutSection.querySelector('div.display-flex.ph5.pv3 span[aria-hidden="true"]') ||
      aboutSection.querySelector('span[aria-hidden="true"]');
    if (aboutText) {
      about = aboutText.textContent?.trim() || '';
    }
    // Strategy 2 (2025/2026): Find the single element with the longest text content
    // About text lives in one element, NOT spread across many leaf nodes
    if (!about) {
      const allEls = Array.from(aboutSection.querySelectorAll('*'));
      let bestText = '';
      for (const el of allEls) {
        const t = (el.textContent || '').trim();
        // Skip the section header and short UI elements
        if (t.toLowerCase() === 'about' || t.length < 20) continue;
        // Skip if it's a container that includes the header text + more
        if (t.startsWith('About') && t.length > 6) {
          const withoutAbout = t.replace(/^About\s*/, '').trim();
          if (withoutAbout.length > bestText.length) bestText = withoutAbout;
          continue;
        }
        // Pick the element whose text is the longest (the actual about paragraph)
        if (t.length > bestText.length && t.length < 3000) {
          bestText = t;
        }
      }
      // Clean: remove trailing "...more" and any section header bleed
      // e.g. "…moreTop skillsPublic Speaking" → truncate at "more" + header
      about = bestText
        .replace(/[…\.]{0,3}\s*more\s*(?:Top skills|Skills|Experience|Education|Activity|Certifications|Languages|Volunteering|Organizations|Courses).*$/is, '')
        .replace(/[…\.]{0,3}\s*more\s*$/i, '')
        .trim();
    }
  }

  // --- 3. Experience ---
  const experiences: Experience[] = [];
  const expSection = getSectionByTitle('Experience');

  if (expSection) {
    // Helper to filter noise lines from experience items
    const filterExpLines = (el: Element) =>
      getVisualLines(el).filter(t => {
        const l = t.toLowerCase();
        return l !== 'experience' && l !== 'show all' &&
          !/^(see|show)\s*(more|less)/i.test(t) && t.length > 1;
      });

    const isDateLine = (l: string) => /\d{4}/.test(l) && /[-–]/.test(l);

    // Strategy 1: 2025/2026 layout — find ALL <li> items with dates across ALL <ul>s
    // Each <ul> groups roles under one company; <li> items are individual roles
    const allRoleLis = Array.from(expSection.querySelectorAll('li')).filter(li => {
      const text = li.textContent || '';
      return isDateLine(text);
    });

    if (allRoleLis.length > 0) {
      const processedUls = new Set<Element>();

      for (const li of allRoleLis) {
        const ul = li.closest('ul');
        if (!ul || processedUls.has(ul)) continue;
        processedUls.add(ul);

        // Find company name from the container above the <ul>
        let groupCompany = '';
        const container = ul.parentElement;
        if (container) {
          const containerLines = getVisualLines(container);
          const ulLines = new Set(getVisualLines(ul));
          for (const t of containerLines) {
            if (ulLines.has(t)) continue;
            const lower = t.toLowerCase();
            if (lower === 'experience' || lower === 'show all') continue;
            if (/^\d+\s*(yr|mo)/i.test(t)) continue;
            if (EXP_EMPLOYMENT_TYPES.some(et => lower === et)) continue;
            if (t.includes('·') && EXP_EMPLOYMENT_TYPES.some(et => lower.includes(et))) continue;
            if (EXP_WORK_LOCATION_TYPES.includes(lower)) continue;
            if (t.length <= 1) continue;
            groupCompany = t.split('·')[0].trim();
            break;
          }
        }

        // Parse each role <li> in this <ul>
        for (const roleLi of Array.from(ul.querySelectorAll(':scope > li'))) {
          if (!isDateLine(roleLi.textContent || '')) continue;
          const lines = filterExpLines(roleLi);
          const exp = parseExperienceItem(lines);
          if (exp) {
            if (!exp.company) exp.company = groupCompany;
            experiences.push(exp);
          }
        }
      }

      // Also handle single entries (not inside <ul>, e.g. Zappyrent)
      // Scan all section lines for date lines whose titles we haven't found yet
      const foundTitles = new Set(experiences.map(e => e.title));
      const allLines = filterExpLines(expSection);
      for (let i = 0; i < allLines.length; i++) {
        if (!isDateLine(allLines[i])) continue;

        // Walk back to find title
        let si = i - 1;
        while (si >= 0) {
          const lower = allLines[si].toLowerCase();
          if (/^\d+\s*(yr|mo)/i.test(allLines[si]) || EXP_WORK_LOCATION_TYPES.includes(lower)) { si--; continue; }
          break;
        }
        let company = '';
        if (si >= 0) {
          const prevLine = allLines[si];
          if (prevLine.includes('·') && EXP_EMPLOYMENT_TYPES.some(t => prevLine.toLowerCase().includes(t))) {
            company = prevLine.split('·')[0].trim();
            si--;
          } else if (EXP_EMPLOYMENT_TYPES.some(t => prevLine.toLowerCase() === t)) {
            si--;
          }
        }
        const title = si >= 0 ? allLines[si] : '';
        if (!title || foundTitles.has(title)) continue;

        const dateLine = allLines[i].split(' · ')[0].trim();
        const dates = parseDateRange(dateLine);
        let loc = '';
        if (i + 1 < allLines.length) {
          const nextLine = allLines[i + 1];
          const nextLower = nextLine.toLowerCase();
          if (nextLine.length < 60 &&
            (EXP_WORK_LOCATION_TYPES.includes(nextLower) ||
              EXP_WORK_LOCATION_TYPES.some(w => nextLower.includes(w)) ||
              (nextLine.includes(',') && /^[A-Z]/.test(nextLine)))) {
            loc = nextLine.split(' · ')[0].trim();
          }
        }

        experiences.push({
          title, company,
          startDate: dates.startDate, endDate: dates.endDate,
          location: loc, description: ''
        });
        foundTitles.add(title);
      }
    }

    // Strategy 2: Classic LinkedIn layout — getListItems based parsing
    if (experiences.length === 0) {
      const items = getListItems(expSection);

      if (items.length > 0) {
        for (const item of items) {
          const itemLines = filterExpLines(item);
          const dateCount = itemLines.filter(l => isDateLine(l)).length;

          if (dateCount <= 1) {
            const exp = parseExperienceItem(itemLines);
            if (exp) experiences.push(exp);
          } else {
            // Grouped company: multiple roles under one company
            let groupCompany = '';
            const firstDateIdx = itemLines.findIndex(l => isDateLine(l));
            for (let i = 0; i < firstDateIdx; i++) {
              const line = itemLines[i];
              if (/^\d+\s*(yr|mo)/i.test(line)) continue;
              if (EXP_EMPLOYMENT_TYPES.includes(line.toLowerCase())) continue;
              groupCompany = line.split('·')[0].trim();
              break;
            }

            const nestedLis = Array.from((item as HTMLElement).querySelectorAll('li'));
            const roleItems = nestedLis.filter(li => {
              const lines = getVisualLines(li);
              return lines.some(l => isDateLine(l));
            });

            if (roleItems.length > 0) {
              for (const roleItem of roleItems) {
                const subLines = filterExpLines(roleItem);
                const exp = parseExperienceItem(subLines);
                if (exp) {
                  if (!exp.company) exp.company = groupCompany;
                  experiences.push(exp);
                }
              }
            } else {
              for (let i = 0; i < itemLines.length; i++) {
                if (!isDateLine(itemLines[i])) continue;
                const dateLine = itemLines[i].split(' · ')[0].trim();
                const dates = parseDateRange(dateLine);
                let title = '';
                let loc = '';
                let si = i - 1;
                while (si >= 0) {
                  const lower = itemLines[si].toLowerCase();
                  if (/^\d+\s*(yr|mo)/i.test(itemLines[si]) || EXP_WORK_LOCATION_TYPES.includes(lower)) { si--; continue; }
                  break;
                }
                if (si >= 0) {
                  const prevLine = itemLines[si];
                  if (EXP_EMPLOYMENT_TYPES.some(t => prevLine.toLowerCase() === t) ||
                      (prevLine.includes('·') && EXP_EMPLOYMENT_TYPES.some(t => prevLine.toLowerCase().includes(t)))) { si--; }
                  if (si >= 0 && itemLines[si] !== groupCompany) title = itemLines[si];
                }
                if (i + 1 < itemLines.length) {
                  const nextLine = itemLines[i + 1];
                  const nextLower = nextLine.toLowerCase();
                  if (nextLine.length < 60 &&
                    (EXP_WORK_LOCATION_TYPES.includes(nextLower) ||
                      EXP_WORK_LOCATION_TYPES.some(w => nextLower.includes(w)) ||
                      (nextLine.includes(',') && /^[A-Z]/.test(nextLine)))) {
                    loc = nextLine.split(' · ')[0].trim();
                  }
                }
                if (title) {
                  experiences.push({ title, company: groupCompany, startDate: dates.startDate, endDate: dates.endDate, location: loc, description: '' });
                }
              }
            }
          }
        }
      }
    }

    // Strategy 3: Fallback line-based approach
    if (experiences.length === 0) {
      const allLines = filterExpLines(expSection);
      const dateIndices: number[] = [];
      allLines.forEach((line, i) => { if (isDateLine(line)) dateIndices.push(i); });

      let lastBoundary = -1;
      for (const dateIdx of dateIndices) {
        const dateLine = allLines[dateIdx].split(' · ')[0].trim();
        const dates = parseDateRange(dateLine);
        let title = '';
        let company = '';
        let loc = '';
        let searchIdx = dateIdx - 1;
        while (searchIdx > lastBoundary) {
          const lower = allLines[searchIdx].toLowerCase();
          if (/^\d+\s*(yr|mo)/i.test(allLines[searchIdx]) || EXP_WORK_LOCATION_TYPES.includes(lower)) { searchIdx--; continue; }
          break;
        }
        if (searchIdx > lastBoundary) {
          const prevLine = allLines[searchIdx];
          if (prevLine.includes('·') && EXP_EMPLOYMENT_TYPES.some(t => prevLine.toLowerCase().includes(t))) {
            company = prevLine.split('·')[0].trim();
            searchIdx--;
          }
          if (searchIdx > lastBoundary) title = allLines[searchIdx];
        }
        const nextIdx = dateIdx + 1;
        if (nextIdx < allLines.length) {
          const nextLine = allLines[nextIdx];
          const nextLower = nextLine.toLowerCase();
          if (nextLine.length < 60 &&
            (EXP_WORK_LOCATION_TYPES.includes(nextLower) ||
              EXP_WORK_LOCATION_TYPES.some(w => nextLower.includes(w)) ||
              (nextLine.includes(',') && /^[A-Z]/.test(nextLine)))) {
            loc = nextLine.split(' · ')[0].trim();
            lastBoundary = nextIdx;
          } else { lastBoundary = dateIdx; }
        } else { lastBoundary = dateIdx; }
        if (title) {
          experiences.push({ title, company, startDate: dates.startDate, endDate: dates.endDate, location: loc, description: '' });
        }
      }

      if (experiences.length > 0 && experiences.some(e => !e.company)) {
        const firstDateIdx = dateIndices[0] || 0;
        const expTitles = new Set(experiences.map(e => e.title));
        for (let i = 0; i < firstDateIdx; i++) {
          const line = allLines[i];
          if (expTitles.has(line)) continue;
          if (/^\d+\s*(yr|mo)/i.test(line)) continue;
          if (EXP_EMPLOYMENT_TYPES.includes(line.toLowerCase())) continue;
          if (line.length <= 2) continue;
          const groupCompany = line.split('·')[0].trim();
          if (groupCompany) {
            experiences.forEach(e => { if (!e.company) e.company = groupCompany; });
            break;
          }
        }
      }
    }
  }

  // Find current company
  const currentRoles = experiences.filter(e => e.endDate?.toLowerCase() === 'present');
  let currentExp = null;

  if (currentRoles.length > 0) {
    currentExp = currentRoles.sort((a, b) => {
      const parseDate = (dateStr: string): number => {
        if (!dateStr) return 0;
        const yearMatch = dateStr.match(/(\d{4})/);
        if (!yearMatch) return 0;
        const year = parseInt(yearMatch[1]);
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthMatch = dateStr.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
        const month = monthMatch ? monthNames.indexOf(monthMatch[1]) + 1 : 1;
        return year * 100 + month;
      };

      return parseDate(b.startDate || '') - parseDate(a.startDate || '');
    })[0];
  } else if (experiences.length > 0) {
    currentExp = experiences[0];
  }

  const currentCompanyFromExperience = currentExp ? currentExp.company : '';
  const currentCompany = currentCompanyFromHeader || currentCompanyFromExperience;

  // --- 4. Education (line-based) ---
  const educations: Education[] = [];
  const eduSection = getSectionByTitle('Education');
  if (eduSection) {
    const allEduLines = getVisualLines(eduSection).filter(t => {
      const l = t.toLowerCase();
      return l !== 'education' && !/^(see|show)\s*(more|less|all)/i.test(t) &&
        !l.startsWith('activities and societies') && !l.startsWith('grade:') &&
        t.length > 1;
    });

    const isEduDateLine = (line: string): boolean => {
      if (line.length > 50) return false;
      if (!/\b(19|20)\d{2}\b/.test(line)) return false;
      return /[-–]/.test(line) || /^\s*(19|20)\d{2}\s*$/.test(line.trim());
    };

    let eduCurrent: { school?: string; degreeField?: string } = {};
    for (const line of allEduLines) {
      if (isEduDateLine(line)) {
        if (eduCurrent.school) {
          const parts = (eduCurrent.degreeField || '').split(',').map(p => p.trim());
          const yearMatch = line.match(/[-–]\s*(\d{4})/);
          const endDate = yearMatch ? yearMatch[1] : (line.match(/(\d{4})/) || [])[1] || '';
          educations.push({
            school: eduCurrent.school, degree: parts[0] || '',
            field: parts.slice(1).join(', ') || '', endDate
          });
          eduCurrent = {};
        }
        continue;
      }
      if (!eduCurrent.school) {
        eduCurrent.school = line;
      } else if (!eduCurrent.degreeField) {
        eduCurrent.degreeField = line;
      } else {
        educations.push({
          school: eduCurrent.school,
          degree: (eduCurrent.degreeField || '').split(',')[0]?.trim() || '',
          field: (eduCurrent.degreeField || '').split(',').slice(1).join(', ')?.trim() || '',
          endDate: ''
        });
        eduCurrent = { school: line };
      }
    }
    if (eduCurrent.school) {
      const parts = (eduCurrent.degreeField || '').split(',').map(p => p.trim());
      educations.push({
        school: eduCurrent.school, degree: parts[0] || '',
        field: parts.slice(1).join(', ') || '', endDate: ''
      });
    }
  }

  // --- 5. Skills (getListItems + line-based fallback) ---
  const skills: string[] = [];
  const skillsSection = getSectionByTitle('Skills');
  if (skillsSection) {
    const items = getListItems(skillsSection);
    if (items.length > 0) {
      items.forEach(item => {
        const lines = getVisualLines(item).filter(t => t.toLowerCase() !== 'skills');
        if (lines.length > 0) skills.push(lines[0]);
      });
    }
    if (skills.length === 0) {
      const allSkillLines = getVisualLines(skillsSection).filter(t => {
        const l = t.toLowerCase();
        return l !== 'skills' && !/^(see|show)\s*(more|less|all)/i.test(t) &&
          !/endorsement/i.test(t) && !/^\d+$/.test(t) && t.length > 1 && t.length < 100;
      });
      for (const line of allSkillLines) {
        if (!skills.includes(line)) skills.push(line);
      }
    }
  }

  // --- 6. Languages (getListItems + line-based fallback) ---
  const languages: string[] = [];
  const langSection = getSectionByTitle('Languages');
  if (langSection) {
    const items = getListItems(langSection);
    if (items.length > 0) {
      items.forEach(item => {
        const lines = getVisualLines(item).filter(t => t.toLowerCase() !== 'languages');
        if (lines.length > 0) languages.push(lines[0]);
      });
    }
    if (languages.length === 0) {
      const allLangLines = getVisualLines(langSection).filter(t => {
        const l = t.toLowerCase();
        return l !== 'languages' && !/^(see|show)\s*(more|less|all)/i.test(t) &&
          !/proficiency/i.test(t) && t.length > 1 && t.length < 100;
      });
      for (const line of allLangLines) {
        if (!languages.includes(line)) languages.push(line);
      }
    }
  }

  // --- 7. Certifications (line-based) ---
  const certifications: Certification[] = [];
  const certSection = getSectionByTitle('Licenses & certifications') || getSectionByTitle('Certifications');
  if (certSection) {
    const allCertLines = getVisualLines(certSection).filter(t => {
      const l = t.toLowerCase();
      return l !== 'certifications' && l !== 'licenses & certifications' &&
        l !== 'licenses' && !/^(see|show)\s*(more|less|all)/i.test(t) &&
        l !== 'show credential' && l !== 'see credential' &&
        !l.startsWith('credential id') && t.length > 1;
    });

    const isCertDateLine = (line: string): boolean =>
      /issued/i.test(line) ||
      (/\b(19|20)\d{2}\b/.test(line) && /[-–]/.test(line) && line.length < 50) ||
      /^no expiration/i.test(line) || /^expires/i.test(line);

    let certCurrent: { name?: string; issuer?: string; issueDate?: string } = {};
    for (const line of allCertLines) {
      if (isCertDateLine(line)) {
        if (!certCurrent.issueDate) certCurrent.issueDate = line;
        if (certCurrent.name) {
          certifications.push({
            name: certCurrent.name, issuer: certCurrent.issuer,
            issueDate: certCurrent.issueDate
          });
          certCurrent = {};
        }
        continue;
      }
      if (!certCurrent.name) {
        certCurrent.name = line;
      } else if (!certCurrent.issuer) {
        certCurrent.issuer = line;
      } else {
        certifications.push({ name: certCurrent.name, issuer: certCurrent.issuer });
        certCurrent = { name: line };
      }
    }
    if (certCurrent.name) {
      certifications.push({
        name: certCurrent.name, issuer: certCurrent.issuer,
        issueDate: certCurrent.issueDate
      });
    }
  }

  // --- 8. Courses (line-based) ---
  const courses: Course[] = [];
  const courseSection = getSectionByTitle('Courses');
  if (courseSection) {
    const allCourseLines = getVisualLines(courseSection).filter(t => {
      const l = t.toLowerCase();
      return l !== 'courses' && !/^(see|show)\s*(more|less|all)/i.test(t) && t.length > 1;
    });
    for (let i = 0; i < allCourseLines.length; i += 2) {
      courses.push({
        name: allCourseLines[i],
        institution: i + 1 < allCourseLines.length ? allCourseLines[i + 1] : undefined
      });
    }
  }

  // --- 9. Organizations (line-based) ---
  const organizations: Organization[] = [];
  const orgSection = getSectionByTitle('Organizations');
  if (orgSection) {
    const allOrgLines = getVisualLines(orgSection).filter(t => {
      const l = t.toLowerCase();
      return l !== 'organizations' && !/^(see|show)\s*(more|less|all)/i.test(t) && t.length > 1;
    });
    for (let i = 0; i < allOrgLines.length; i += 2) {
      organizations.push({
        name: allOrgLines[i],
        role: i + 1 < allOrgLines.length ? allOrgLines[i + 1] : undefined
      });
    }
  }

  // --- 10. Recommendations (as references) ---
  // Sync parse of visible recs; full async scrape happens in parseProfileWithRetry
  const recSection = getSectionByTitle('Recommendations') || getSectionByTitle('Recommendation');
  const recommendations = parseRecommendationsFromContainer(recSection);


  // --- 11. Connection Degree ---
  const connectionDegree = getConnectionDegree();

  return {
    firstName: firstName || 'Unknown',
    lastName: lastName || '',
    headline,
    location,
    linkedinUrl: url,
    currentCompany,
    about,
    profilePictureUrl,
    connectionDegree,
    experiences,
    educations,
    skills,
    languages,
    certifications,
    courses,
    organizations,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
};

/**
 * Parses recommendations from a container element (section or modal).
 * LinkedIn only shows recommender metadata on profile page (name, title, date/relationship).
 * Full recommendation text is only visible after clicking "Show all".
 * This captures what's available: "Name, Title — relationship context" or "Name: full text".
 */
export function parseRecommendationsFromContainer(container: HTMLElement | null): string[] {
  const recommendations: string[] = [];
  if (!container) return recommendations;

  const allLines = getVisualLines(container).filter(t => {
    const l = t.toLowerCase();
    return l !== 'recommendations' && l !== 'recommendation' &&
      !l.startsWith('received') && !l.startsWith('given') &&
      !l.startsWith('recommend ') && !l.startsWith('show all') &&
      l !== 'show more' && l !== 'show less' && l !== 'see more' && l !== 'see less' &&
      !t.startsWith('· ') && t.length > 2;
  });

  const dateRelPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i;

  // Collect per-recommendation data, then build entries
  let currentTitle = '';
  let currentRelationship = '';

  for (const line of allLines) {
    // Date-relationship line: "December 23, 2025, Evelina was Edgars's client"
    if (dateRelPattern.test(line)) {
      // If we already have a pending relationship, flush previous rec
      if (currentRelationship) {
        recommendations.push(currentTitle ? `${currentTitle} — ${currentRelationship}` : currentRelationship);
      }
      // Extract relationship part after the date
      const relMatch = line.match(/\d{4},\s*(.+)/);
      currentRelationship = relMatch ? relMatch[1].trim() : line;
      currentTitle = '';
      continue;
    }

    // Long text (>80 chars with punctuation) = actual recommendation text
    if (line.length > 80 && (line.includes('. ') || line.includes('! ') || line.includes(', '))) {
      // Flush any pending metadata first
      const prefix = currentTitle || '';
      const entry = prefix ? `${prefix}: ${line}` : line;
      recommendations.push(entry);
      currentTitle = '';
      currentRelationship = '';
      continue;
    }

    // Short text = recommender title/company (e.g., "CEO at Vervo Group", "Logistics by NEXT MOVE SIA")
    if (line.length < 100) {
      currentTitle = line;
    }
  }

  // Flush last pending rec
  if (currentRelationship) {
    recommendations.push(currentTitle ? `${currentTitle} — ${currentRelationship}` : currentRelationship);
  }

  return recommendations;
}

