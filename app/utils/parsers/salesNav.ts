import { CandidateProfile, Experience, Education, Certification, Course, Organization } from '../../types';
import { parseDateRange, getConnectionDegree } from './shared';

/**
 * Parses a Sales Navigator lead profile page.
 * Sales Navigator has a different DOM structure than regular LinkedIn profiles.
 */
export const parseSalesNavigatorProfile = (): CandidateProfile => {
  const url = window.location.href;

  // --- 1. Basic Info ---
  const headerEl = document.querySelector('[class*="_header_"]');

  // Name: Try multiple strategies
  let fullName = '';

  // Helper function to check if text looks like a person's name
  const looksLikePersonName = (text: string): boolean => {
    if (!text || text.length < 3 || text.length > 50) return false;
    const words = text.trim().split(/\s+/);
    if (words.length < 2 || words.length > 5) return false;
    const allCapitalized = words.every(word => /^[A-Z]/.test(word));
    if (!allCapitalized) return false;
    if (/\d/.test(text)) return false;
    if (/[&@#$%]/.test(text)) return false;
    return true;
  };

  // Helper function to check if text looks like a company name rather than a person
  const looksLikeCompanyName = (text: string): boolean => {
    if (!text) return false;
    const companyPatterns = [
      /\s&\s/,           // Contains " & "
      /\bCo\.?$/i,
      /\bLtd\.?$/i,
      /\bInc\.?$/i,
      /\bLLC$/i,
      /\bGmbH$/i,
      /\bAG$/i,
      /\bPlc\.?$/i,
      /\bCorp\.?$/i,
      /\bGroup$/i,
      /\bPartners$/i,
      /\bCapital$/i,
      /\bBank$/i,
      /\bFinance$/i,
      /\bCorporate\b/i,
      /\bConsulting$/i,
      /\bAdvisors?$/i,
      /\bHoldings?$/i,
      /\bVentures?$/i,
      /\bServices$/i,
      /\bSolutions$/i,
      /\bTechnolog(y|ies)$/i,
      /\bManagement$/i,
      /\bInvestments?$/i,
    ];
    return companyPatterns.some(pattern => pattern.test(text));
  };

  // Strategy 1: Look for profile topcard name element
  const profileNameEl = document.querySelector('[data-x--lead-name], [class*="profile-topcard"] [class*="_name_"]');
  if (profileNameEl) {
    const text = profileNameEl.textContent?.trim();
    if (text && looksLikePersonName(text) && !looksLikeCompanyName(text)) {
      fullName = text;
    }
  }

  // Strategy 2: span with _name_ class but NOT inside company/account sections
  if (!fullName) {
    const nameSpans = document.querySelectorAll('span[class*="_name_"]');
    const candidates: string[] = [];
    for (const span of nameSpans) {
      const text = span.textContent?.trim();
      const isInsideCompanySection = span.closest('[class*="account"], [class*="company"], [class*="_savedAccount_"]');
      if (text && !isInsideCompanySection && text.length < 60) {
        candidates.push(text);
      }
    }
    for (const text of candidates) {
      if (looksLikePersonName(text) && !looksLikeCompanyName(text)) {
        fullName = text;
        break;
      }
    }
    if (!fullName) {
      for (const text of candidates) {
        if (!looksLikeCompanyName(text)) {
          fullName = text;
          break;
        }
      }
    }
  }

  // Strategy 3: element with _headingText_ class
  if (!fullName) {
    const headingTextEls = document.querySelectorAll('[class*="_headingText_"]');
    for (const el of headingTextEls) {
      const text = el.textContent?.trim();
      if (text && !text.includes('Lead Page') && !text.includes('information for') &&
        looksLikePersonName(text) && !looksLikeCompanyName(text) && text.length < 60) {
        fullName = text;
        break;
      }
    }
  }

  // Strategy 4: h1 inside header (fallback)
  if (!fullName && headerEl) {
    const h1Els = headerEl.querySelectorAll('h1');
    for (const h of h1Els) {
      const text = h.textContent?.trim();
      if (text && !text.includes('Lead Page') && !text.includes('information for') &&
        !text.includes('insights') && looksLikePersonName(text) && !looksLikeCompanyName(text) && text.length < 60) {
        fullName = text;
        break;
      }
    }
  }

  let firstName = '';
  let lastName = '';
  if (fullName) {
    const parts = fullName.trim().split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  // Headline
  let headline = '';
  const profileHeader = document.querySelector('[class*="_profile-card_"], [class*="_header_"], [class*="_topcard_"]');

  const isInSafeArea = (el: Element): boolean => {
    const parent = el.closest('section, [class*="_interests_"], [class*="_education_"], [class*="_experience_"]');
    if (parent) {
      const headings = parent.querySelectorAll('h2');
      for (const h of headings) {
        const txt = h.textContent?.toLowerCase() || '';
        if (txt.includes('interests') || txt.includes('education') || txt.includes('experience')) {
          return false;
        }
      }
    }
    if (el.closest('a[href*="/lead/"]') || el.closest('a[href*="/in/"]')) {
      return false;
    }
    return true;
  };

  // Strategy 1: subhead div class
  const subheadEl = document.querySelector('div[class*="_subhead_"]');
  if (subheadEl && isInSafeArea(subheadEl)) {
    const text = subheadEl.textContent?.trim();
    if (text && text.length > 5 && text.length < 200) {
      headline = text.replace(/\s+/g, ' ').trim();
    }
  }

  // Strategy 2: bodyText paragraphs within header
  if (!headline && profileHeader) {
    const paragraphs = profileHeader.querySelectorAll('p[class*="_bodyText_"], div[class*="_bodyText_"]');
    for (const p of paragraphs) {
      if (!isInSafeArea(p)) continue;
      const text = p.textContent?.trim();
      if (text && text.length > 5 && text.length < 200 &&
        !text.includes('Message') && !text.includes('connection') &&
        !text.includes('warm introduction') && !text.includes('Show more') &&
        !text.includes('followers')) {
        headline = text.replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }

  // Strategy 3: Fallback
  if (!headline) {
    const nameEl = document.querySelector('span[class*="_name_"], h1[class*="_name_"]');
    if (nameEl) {
      const parent = nameEl.closest('div');
      if (parent) {
        const sibling = parent.nextElementSibling;
        if (sibling) {
          const text = sibling.textContent?.trim();
          if (text && text.length > 5 && text.length < 150 &&
            !text.includes('connection') && !text.includes('Message')) {
            headline = text.replace(/\s+/g, ' ').trim();
          }
        }
      }
    }
  }

  // Location
  let location = '';

  if (headerEl) {
    const headerDivs = headerEl.querySelectorAll('div[class*="_bodyText_"]');
    for (const d of headerDivs) {
      const text = d.textContent?.trim();
      if (text && text.includes(',') && text.length < 60 && text.length > 5 &&
        !text.includes('connection') && !text.includes('Viewed') &&
        !text.includes('@') && !text.includes('http') && !text.includes('|') &&
        !text.includes('Engineer') && !text.includes('Developer')) {
        location = text;
        break;
      }
    }
  }

  if (!location && headerEl) {
    const allEls = headerEl.querySelectorAll('*');
    for (const el of allEls) {
      if (el.children.length <= 2) {
        const text = el.textContent?.trim();
        if (text && text.length < 60 && text.length > 5 &&
          (text.includes('India') || text.includes('United States') || text.includes('UK') ||
            text.includes('Germany') || text.includes('Canada') || text.includes('Australia') ||
            text.includes('Area') || text.includes('Metro')) &&
          !text.includes('@') && !text.includes('|')) {
          location = text;
          break;
        }
      }
    }
  }

  if (!location) {
    const locationDivs = document.querySelectorAll('div[class*="_bodyText_"]');
    for (const d of locationDivs) {
      const text = d.textContent?.trim();
      if (text && text.includes(',') && text.length < 60 && text.length > 5 &&
        !text.includes('connection') && !text.includes('Viewed') &&
        !text.includes('@') && !text.includes('http') && !text.includes('|') &&
        !text.includes('Engineer') && !text.includes('Developer')) {
        location = text;
        break;
      }
    }
  }

  // Profile Picture
  let profilePictureUrl = '';

  if (fullName) {
    const namePattern = new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      const alt = (img as HTMLImageElement).alt || '';
      const src = (img as HTMLImageElement).src || '';
      if (namePattern.test(alt) && src.includes('profile-displayphoto') &&
        !src.includes('ghost') && (img as HTMLImageElement).width >= 50) {
        profilePictureUrl = src;
        break;
      }
    }
  }

  if (!profilePictureUrl) {
    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      const src = (img as HTMLImageElement).src || '';
      const alt = (img as HTMLImageElement).alt || '';
      const isInHeader = img.closest('header, nav, [class*="global-nav"], [class*="eah-header"]');
      if (src.includes('profile-displayphoto') && !src.includes('ghost') &&
        (img as HTMLImageElement).width >= 50 && !isInHeader &&
        !alt.toLowerCase().includes('your profile')) {
        profilePictureUrl = src;
        break;
      }
    }
  }

  if (!profilePictureUrl) {
    const imgSelectors = [
      'img[alt*="profile picture" i]',
      'button[class*="profile-picture"] img',
      'img[class*="profile-photo"]'
    ];
    for (const selector of imgSelectors) {
      const img = document.querySelector(selector) as HTMLImageElement;
      const isInHeader = img?.closest('header, nav, [class*="global-nav"], [class*="eah-header"]');
      if (img?.src && img.src.startsWith('http') && !img.src.includes('ghost') &&
        !img.src.includes('displaybackgroundimage') && !isInHeader) {
        profilePictureUrl = img.src;
        break;
      }
    }
  }

  if (!profilePictureUrl) {
    const metaImage = document.querySelector('meta[property="og:image"]');
    if (metaImage) {
      const content = metaImage.getAttribute('content');
      if (content && content.startsWith('http') && !content.includes('ghost') &&
        !content.includes('unavailable') && content.includes('profile-displayphoto')) {
        profilePictureUrl = content;
      }
    }
  }

  // --- Contact Information (Phone & Email) ---
  let email = '';
  let phone = '';

  const contactSection = document.querySelector('section[data-sn-view-name="lead-contact-info"]');
  if (contactSection) {
    const phoneLink = contactSection.querySelector('a[href^="tel:"]');
    if (phoneLink) {
      const phoneSpan = phoneLink.querySelector('span[data-anonymize="phone"]');
      if (phoneSpan) {
        phone = phoneSpan.textContent?.trim() || '';
      } else {
        const href = phoneLink.getAttribute('href') || '';
        phone = href.replace('tel:', '');
      }
    }

    const emailLink = contactSection.querySelector('a[href^="mailto:"]');
    if (emailLink) {
      const emailSpan = emailLink.querySelector('span[data-anonymize="email"]');
      if (emailSpan) {
        email = emailSpan.textContent?.trim() || '';
      } else {
        const href = emailLink.getAttribute('href') || '';
        email = href.replace('mailto:', '');
      }
    }
  }

  if (!phone && !email) {
    const contactHeading = Array.from(document.querySelectorAll('h2, h3')).find(h =>
      h.textContent?.trim() === 'Contact information'
    );
    if (contactHeading) {
      const container = contactHeading.closest('section') || contactHeading.parentElement?.parentElement;
      if (container) {
        const telLink = container.querySelector('a[href^="tel:"]') as HTMLAnchorElement;
        if (telLink && !phone) {
          phone = telLink.href.replace('tel:', '');
        }
        const mailLink = container.querySelector('a[href^="mailto:"]') as HTMLAnchorElement;
        if (mailLink && !email) {
          email = mailLink.href.replace('mailto:', '');
        }
      }
    }
  }

  // --- 2. About Section ---
  let about = '';
  const aboutHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.trim().toLowerCase() === 'about'
  );
  if (aboutHeading) {
    const aboutSection = aboutHeading.closest('section') || aboutHeading.parentElement?.parentElement;
    if (aboutSection) {
      const aboutTexts = aboutSection.querySelectorAll('span, p, div');
      for (const el of aboutTexts) {
        const text = el.textContent?.trim();
        if (text && text.length > 30 && text.length < 2000 &&
          text !== 'About' && !text.includes('Show more') && !text.includes('Show less')) {
          about = text.replace(/\s+/g, ' ').replace(/…\s*Show more/g, '').trim();
          break;
        }
      }
    }
  }

  // --- 3. Experience ---
  const experiences: Experience[] = [];

  // STRATEGY A: Try to get current role from "Current role" section first
  const currentRoleHeading = Array.from(document.querySelectorAll('*')).find(el =>
    el.textContent?.trim() === 'Current role'
  );

  if (currentRoleHeading) {
    const roleSection = currentRoleHeading.closest('section') || currentRoleHeading.parentElement?.parentElement;
    const roleText = roleSection?.querySelector('p[class*="_current-role-item_"], p[class*="_headingText_"]');

    if (roleText) {
      const fullRoleText = roleText.textContent?.trim();
      if (fullRoleText && fullRoleText.includes(' at ')) {
        const parts = fullRoleText.split(' at ');
        const title = parts[0].trim();
        const company = parts[1].trim();

        const dateElement = roleSection?.querySelector('span, p');
        let startDate = '';
        let endDate = '';
        if (dateElement) {
          const dateText = dateElement.textContent?.trim();
          if (dateText && dateText.match(/\d{4}/)) {
            const dates = parseDateRange(dateText);
            startDate = dates.startDate;
            endDate = dates.endDate;
          }
        }

        experiences.push({
          title,
          company,
          startDate,
          endDate,
          location: location,
          description: ''
        });
      }
    }
  }

  // STRATEGY B: Parse from Experience section
  const expHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.toLowerCase().includes('experience') && !h.textContent?.includes('Shared')
  );

  if (expHeading) {
    const expSection = expHeading.closest('[role="region"]') || expHeading.closest('section') || expHeading.parentElement;
    const expList = expSection?.querySelector('ul, ol');
    const expItems = expList?.querySelectorAll(':scope > li[class*="_experience"], :scope > li');

    expItems?.forEach((item, index) => {
      let title = '';
      let company = '';

      const titleParagraphs = item.querySelectorAll('p[class*="_headingText_"], p[class*="_current-role-item_"], h2[class*="_bodyText_"]');

      for (const p of titleParagraphs) {
        const text = p.textContent?.trim();
        if (!text || text.length > 200) continue;
        if (text.includes('How') && text.includes('money')) continue;
        if (text.includes('Account')) continue;
        if (text.includes('Summarized')) continue;

        if (text.includes(' at ')) {
          const parts = text.split(' at ');
          title = parts[0].trim();
          company = parts[1].trim();
          break;
        }

        if (!title && text.length > 5 && text.length < 150) {
          title = text;
        }
      }

      if (index === 0 && experiences.length > 0 && !title) {
        return;
      }

      // Company strategies
      const companyLinks = item.querySelectorAll('a[href*="/sales/company/"], a[href*="/company/"], a[class*="link--mercado"]');
      if (!company) {
        for (const link of companyLinks) {
          const linkText = link.textContent?.trim();
          if (linkText && linkText.length > 0 && linkText.length < 100 &&
            !linkText.includes('Strategic') && !linkText.includes('Business') &&
            !linkText.includes('Competitive') && !linkText.includes('Headcount') &&
            !linkText.includes('View Relationship')) {
            company = linkText;
            break;
          }
        }
      }

      if (!company) {
        const headings = item.querySelectorAll('h2[class*="_bodyText_"]');
        for (const h of headings) {
          const h2Text = h.textContent?.trim();
          const matchingLink = Array.from(companyLinks).find(link =>
            link.textContent?.trim() === h2Text
          );
          if (matchingLink && h2Text && h2Text.length > 0 && h2Text.length < 100) {
            company = h2Text;
            if (title === company) {
              title = '';
            }
            break;
          }
        }
      }

      if (!company) {
        const allSpans = Array.from(item.querySelectorAll('span')).map(s => s.textContent?.trim() || '').filter(t => t.length > 0);
        for (const text of allSpans) {
          if (text === title) continue;
          if (/\d{4}/.test(text)) continue;
          if (/\d+\s*(yr|mo|year|month)/i.test(text)) continue;
          if (text.includes('Present')) continue;
          if (text.length > 100) continue;
          if (text.includes('Show more') || text.includes('Show less')) continue;
          if (text.includes(',') && (text.includes('Germany') || text.includes('United') || text.includes('Area') || text.includes('Remote'))) continue;
          if (text.length >= 2 && text.length < 80) {
            company = text;
            break;
          }
        }
      }

      // Dates and duration
      let startDate = '';
      let endDate = '';
      let loc = '';
      let description = '';

      const spans = item.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (!text) continue;

        const dateMatch = text.match(/([A-Za-z]{3}\s\d{4}|[A-Za-z]+\s\d{4}|\d{4})\s*[–-]\s*(Present|[A-Za-z]{3}\s\d{4}|[A-Za-z]+\s\d{4}|\d{4})/i);
        if (dateMatch && !startDate) {
          const dates = parseDateRange(text);
          startDate = dates.startDate;
          endDate = dates.endDate;
          continue;
        }

        if (text.includes(',') && text.length < 60 && !text.includes('–') && startDate) {
          if (!text.includes('yr') && !text.includes('mo') && !text.includes('Show')) {
            loc = text;
            continue;
          }
        }

        if (text.length > 50 && !text.includes('Show more') && !text.includes('Summarized by AI') &&
          !text.includes('Sources:') && !text.includes('Was this helpful')) {
          description = text.replace(/…\s*Show more/g, '').trim();
        }
      }

      if (title && company) {
        experiences.push({
          title,
          company,
          startDate,
          endDate,
          location: loc,
          description
        });
      }
    });
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

  const currentCompany = currentExp ? currentExp.company : '';

  // --- 4. Education ---
  const educations: Education[] = [];
  const eduHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.trim().toLowerCase() === 'education'
  );

  const looksLikeSchoolName = (text: string): boolean => {
    if (!text || text.length < 3) return false;
    const schoolPatterns = [
      /university/i, /college/i, /school/i, /institute/i, /academy/i,
      /polytechnic/i, /hochschule/i, /universit[äaà]/i,
      /^MIT$/i, /^LSE$/i, /^UCLA$/i, /^NYU$/i, /^ETH/i,
      /^INSEAD$/i, /^HEC$/i, /^LBS$/i, /^WBS$/i,
    ];
    return schoolPatterns.some(pattern => pattern.test(text));
  };

  const looksLikeDegree = (text: string): boolean => {
    if (!text || text.length < 2) return false;
    const degreePatterns = [
      /^BA\b/i, /^BS\b/i, /^BSc\b/i, /^BBA\b/i, /^BCom\b/i,
      /^MA\b/i, /^MS\b/i, /^MSc\b/i, /^MBA\b/i, /^MPhil\b/i,
      /^PhD\b/i, /^Dr\.?\b/i, /^JD\b/i, /^LLB\b/i, /^LLM\b/i,
      /^Bachelor/i, /^Master/i, /^Doctor/i,
      /\(hons?\)/i, /honours?/i, /degree/i, /diploma/i, /certificate/i,
    ];
    return degreePatterns.some(pattern => pattern.test(text));
  };

  const looksLikeFieldOfStudy = (text: string): boolean => {
    if (!text || text.length < 3) return false;
    const fieldPatterns = [
      /economics/i, /business/i, /finance/i, /accounting/i,
      /engineering/i, /computer science/i, /mathematics/i, /physics/i,
      /chemistry/i, /biology/i, /medicine/i, /law/i,
      /psychology/i, /sociology/i, /philosophy/i, /history/i,
      /political science/i, /international relations/i,
      /marketing/i, /management/i, /communications/i,
    ];
    return fieldPatterns.some(pattern => pattern.test(text));
  };

  if (eduHeading) {
    const eduSection = eduHeading.closest('section') || eduHeading.closest('[role="region"]') || eduHeading.parentElement?.parentElement;
    const eduList = eduSection?.querySelector('ul, ol');
    const eduItems = eduList?.querySelectorAll(':scope > li') || eduSection?.querySelectorAll('li');

    eduItems?.forEach(item => {
      const allTexts: string[] = [];

      const schoolLink = item.querySelector('a[href*="school"], a[href*="linkedin.com/school"], a[href*="/company/"]');
      if (schoolLink?.textContent?.trim()) {
        allTexts.push(schoolLink.textContent.trim());
      }

      const headings = item.querySelectorAll('h2, h3');
      headings.forEach(h => {
        const t = h.textContent?.trim();
        if (t && !allTexts.includes(t)) allTexts.push(t);
      });

      const spans = item.querySelectorAll('span');
      spans.forEach(s => {
        const t = s.textContent?.trim();
        if (t && t.length > 1 && t.length < 100 && !allTexts.includes(t)) {
          allTexts.push(t);
        }
      });

      const uniqueTexts = [...new Set(allTexts)].filter(t =>
        t.length > 1 && !t.includes('Show more') && !t.includes('Show less')
      );

      let school = '';
      let degree = '';
      let field = '';
      let endDate = '';

      for (const text of uniqueTexts) {
        const yearMatch = text.match(/(\d{4})/);
        if (yearMatch && !endDate) {
          const rangeMatch = text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
          if (rangeMatch) {
            endDate = rangeMatch[2];
          } else {
            endDate = yearMatch[1];
          }
          continue;
        }

        if (!school && looksLikeSchoolName(text)) {
          school = text;
          continue;
        }

        if (looksLikeDegree(text)) {
          if (!degree) {
            degree = text;
          } else if (text !== degree) {
            degree = degree + ' ' + text;
          }
          continue;
        }

        if (!field && looksLikeFieldOfStudy(text)) {
          field = text;
          continue;
        }
      }

      if (!school) {
        for (const text of uniqueTexts) {
          if (!looksLikeDegree(text) && !looksLikeFieldOfStudy(text) &&
            !text.match(/^\d{4}/) && !text.match(/^\d{4}\s*[-–]/) &&
            text.length > 5 && text !== degree && text !== field) {
            school = text;
            break;
          }
        }
      }

      if (school || (degree && degree.length > 2)) {
        educations.push({ school: school || '', degree, field, endDate });
      }
    });
  }

  // --- 5. Skills ---
  const skills: string[] = [];
  const skillsHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.toLowerCase().includes('skill')
  );

  if (skillsHeading) {
    const skillsSection = skillsHeading.closest('section') || skillsHeading.parentElement?.parentElement;
    const skillItems = skillsSection?.querySelectorAll('li');

    skillItems?.forEach(item => {
      let skillName = '';

      const firstChild = item.firstElementChild;
      if (firstChild) {
        const text = firstChild.textContent?.trim();
        if (text && text.length > 1 && text.length < 60 &&
          !text.includes('endorsement') && !/^\d+$/.test(text)) {
          skillName = text;
        }
      }

      if (!skillName) {
        const nameEl = item.querySelector('span[class*="_name_"], span[class*="_title_"]') ||
          item.querySelector('a span');
        if (nameEl) {
          const text = nameEl.textContent?.trim();
          if (text && text.length > 1 && text.length < 60 &&
            !text.includes('endorsement') && !/^\d+$/.test(text)) {
            skillName = text;
          }
        }
      }

      if (!skillName) {
        const allSpans = item.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent?.trim();
          if (text && text.length > 1 && text.length < 60 &&
            !text.includes('endorsement') && !/^\d+$/.test(text) &&
            !text.includes('Show')) {
            skillName = text;
            break;
          }
        }
      }

      if (skillName) {
        skills.push(skillName);
      }
    });
  }

  // --- 6. Languages ---
  const languages: string[] = [];
  const langHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.trim().toLowerCase() === 'languages'
  );

  if (langHeading) {
    const langSection = langHeading.closest('section') || langHeading.parentElement?.parentElement;
    const langItems = langSection?.querySelectorAll('li');

    langItems?.forEach(item => {
      const nameEl = item.querySelector('span[class*="_name_"], span[class*="_title_"]') ||
        item.querySelector('span:first-child');

      if (nameEl) {
        const text = nameEl.textContent?.trim();
        if (text && text.length > 1 && text.length < 40 &&
          !text.toLowerCase().includes('proficiency') &&
          !text.toLowerCase().includes('fluent') &&
          !text.toLowerCase().includes('native') &&
          !text.toLowerCase().includes('elementary')) {
          languages.push(text);
        }
      } else {
        const spans = item.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent?.trim();
          if (text && text.length > 1 && text.length < 40 &&
            !text.toLowerCase().includes('proficiency') &&
            !text.toLowerCase().includes('fluent') &&
            !text.toLowerCase().includes('native') &&
            !text.toLowerCase().includes('elementary')) {
            languages.push(text);
            break;
          }
        }
      }
    });
  }

  // --- 7. Connection Degree ---
  const connectionDegree = getConnectionDegree();

  // Sales Navigator doesn't show certifications, courses, or organizations
  const certifications: Certification[] = [];
  const courses: Course[] = [];
  const organizations: Organization[] = [];

  return {
    firstName: firstName || 'Unknown',
    lastName: lastName || '',
    headline,
    location,
    linkedinUrl: url,
    currentCompany,
    about,
    profilePictureUrl,
    email,
    phone,
    connectionDegree,
    experiences,
    educations,
    skills,
    languages,
    certifications,
    courses,
    organizations
  };
};
