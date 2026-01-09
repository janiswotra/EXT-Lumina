import { CandidateProfile, Experience, Education } from '../types';

/**
 * Helper to safely get text content from a specific selector within a root element.
 */
const getText = (root: Element | Document, selector: string): string => {
  const el = root.querySelector(selector);
  return el ? (el.textContent?.trim() || '') : '';
};

/**
 * Waits for the LinkedIn profile page to be fully loaded.
 * Returns true if profile elements are detected, false if timeout.
 * Optimized: 5s timeout (reduced from 10s) - if name hasn't loaded by then, it's an error.
 */
export const waitForProfileToLoad = (timeout: number = 5000): Promise<boolean> => {
  return new Promise((resolve) => {
    const startTime = Date.now();

    // Use setInterval instead of requestAnimationFrame so it works in background tabs
    const intervalId = setInterval(() => {
      // Multiple selectors to detect profile elements - extended for 2024/2025 LinkedIn layouts
      const nameSelectors = [
        // Main LinkedIn profile (2024-2025 layout)
        'h1.text-heading-xlarge',
        '.text-heading-xlarge',
        'h1.t-24',
        '.pv-text-details__left-panel h1',
        // Top card container with name
        '.pv-top-card h1',
        '.pv-top-card-v2 h1',
        '.pv-top-card--list h1',
        // Alternative profile header patterns
        '[data-generated-suggestion-target] h1',
        '.artdeco-entity-lockup__title',
        // Sales Navigator
        '.profile-topcard-person-entity__name',
        '.profile-topcard h1',
        // Recruiter
        '.profile-info h1',
        '.profile-info__title',
        // Generic fallback - any h1 in main content area
        'main h1',
        '.scaffold-layout__main h1'
      ];

      for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent?.trim()) {
          console.log('[Lumina Parser] Profile loaded, detected via:', selector);
          clearInterval(intervalId);
          resolve(true);
          return;
        }
      }

      // Log progress every 2 seconds for debugging
      const elapsed = Date.now() - startTime;
      if (elapsed > 0 && elapsed % 2000 < 100) {
        console.log(`[Lumina Parser] Still waiting for profile... (${Math.round(elapsed / 1000)}s elapsed)`);
      }

      if (elapsed >= timeout) {
        console.log('[Lumina Parser] Profile load timeout after', timeout, 'ms');
        clearInterval(intervalId);
        resolve(false);
        return;
      }
    }, 100); // Check every 100ms
  });
};

/**
 * Scrolls through the page to trigger LinkedIn's lazy loading of content.
 * ONLY use for background/headless scrapes, NOT when user is actively viewing.
 * Total time: ~1 second
 */
export const triggerLazyLoading = async (): Promise<void> => {
  console.log('[Lumina Parser] Triggering lazy loading via scroll...');
  const scrollPositions = [300, 600, 1000, 1500, 2000, 2500, 3000];

  for (const pos of scrollPositions) {
    window.scrollTo({ top: pos, behavior: 'instant' as ScrollBehavior });
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // Return to top for consistent state
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log('[Lumina Parser] Lazy loading scroll complete');
};

/**
 * Attempts to parse profile with retry logic.
 * Useful when LinkedIn's DOM hasn't fully loaded.
 *
 * @param maxRetries - Number of retry attempts
 * @param delayMs - Base delay between retries (250ms default)
 * @param enableScrolling - If true, scrolls the page to trigger lazy loading.
 *                          Use ONLY for background/headless scrapes (Check for Updates).
 *                          Set to false for manual user interactions to avoid jarring UX.
 */
export const parseProfileWithRetry = async (
  maxRetries: number = 3,
  delayMs: number = 250,
  enableScrolling: boolean = false
): Promise<CandidateProfile> => {
  // Only trigger lazy loading if explicitly enabled (background scrapes only)
  if (enableScrolling) {
    await triggerLazyLoading();
  }

  let lastResult = parseProfile();

  for (let i = 0; i < maxRetries; i++) {
    // Check if we got meaningful data
    if (lastResult.firstName && lastResult.firstName !== 'Unknown') {
      console.log(`[Lumina Parser] Successfully parsed profile on attempt ${i + 1}`);
      return lastResult;
    }

    // Wait before retry with exponential backoff (250->375->562ms = ~1.2s total max)
    const waitTime = delayMs * Math.pow(1.5, i);
    console.log(`[Lumina Parser] Retry ${i + 1}/${maxRetries} in ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    lastResult = parseProfile();
  }

  console.log('[Lumina Parser] Max retries reached, returning best result');
  return lastResult;
};

/**
 * Finds a section element based on the text content of its header.
 */
const getSectionByTitle = (titleKeyword: string): HTMLElement | null => {
  const sections = Array.from(document.querySelectorAll('section'));

  return sections.find(section => {
    const header = section.querySelector('div[id*="header"] h1, h2, span, h1');
    if (header && header.textContent) {
      return header.textContent.trim().toLowerCase().includes(titleKeyword.toLowerCase());
    }
    return false;
  }) || null;
};

/**
 * Extracts list items from a given section element.
 */
const getListItems = (section: HTMLElement): Element[] => {
  if (!section) return [];
  const items = section.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item');
  return Array.from(items);
};

/**
 * Converts date string like "Jan 2020" or "2020" to "YYYY-MM" format
 */
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';

  // Handle "Present"
  if (dateStr.toLowerCase() === 'present') return 'Present';

  // Handle "YYYY" format
  if (/^\d{4}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }

  // Handle "Mon YYYY" format (e.g., "Jan 2020")
  const monthMap: { [key: string]: string } = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  const match = dateStr.match(/([A-Za-z]{3})\s*(\d{4})/);
  if (match) {
    const month = monthMap[match[1].toLowerCase()] || '01';
    return `${match[2]}-${month}`;
  }

  return dateStr;
};

/**
 * Parses a date range string like "Jan 2020 - Present" or "2015 - 2018"
 */
const parseDateRange = (text: string): { startDate: string; endDate: string } => {
  const dateRegex = /([A-Za-z]{3}\s\d{4}|\d{4})\s*[-–]\s*(Present|[A-Za-z]{3}\s\d{4}|\d{4})/i;
  const match = text.match(dateRegex);

  if (match) {
    return {
      startDate: formatDate(match[1]),
      endDate: formatDate(match[2])
    };
  }

  return { startDate: '', endDate: '' };
};

export const parseProfile = (): CandidateProfile => {
  const url = window.location.href;

  // --- 1. Basic Info ---
  const fullName = getText(document, 'h1.text-heading-xlarge') ||
    getText(document, '.text-heading-xlarge') ||
    getText(document, 'h1.t-24') ||
    getText(document, '.pv-text-details__left-panel h1');

  let firstName = '';
  let lastName = '';

  if (fullName) {
    const parts = fullName.trim().split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  const headline = getText(document, '.text-body-medium.break-words') ||
    getText(document, '[data-generated-suggestion-target="headline"]');

  const location = getText(document, '.text-body-small.inline.t-black--light.break-words') ||
    getText(document, '.pb2 .text-body-small');

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

    for (const selector of pictureSelectors) {
      const imgEl = document.querySelector(selector) as HTMLImageElement;
      if (imgEl && imgEl.src) {
        const src = imgEl.src;
        if (!src.includes('data:image') &&
          !src.startsWith('blob:') &&
          !src.includes('ghost') &&
          !src.includes('placeholder') &&
          !src.includes('static.licdn.com/aero-v1/sc/h/') &&
          src.startsWith('http')) {
          profilePictureUrl = src;
          console.log('[Lumina Parser] Found profile picture:', selector);
          break;
        }
      }
    }

    if (!profilePictureUrl) {
      const photoButton = document.querySelector('button.pv-top-card-profile-picture--photo') as HTMLElement;
      if (photoButton) {
        const bgImg = photoButton.querySelector('img') as HTMLImageElement;
        if (bgImg && bgImg.src && bgImg.src.startsWith('http') && !bgImg.src.startsWith('blob:')) {
          profilePictureUrl = bgImg.src;
        }
      }
    }
  }

  if (!profilePictureUrl) {
    console.log('[Lumina Parser] Could not find profile picture');
  }

  // --- 2. About Section ---
  let about = '';
  const aboutSection = getSectionByTitle('About');
  if (aboutSection) {
    const aboutText = aboutSection.querySelector('div.display-flex.ph5.pv3 span[aria-hidden="true"]') ||
      aboutSection.querySelector('span[aria-hidden="true"]');
    if (aboutText) {
      about = aboutText.textContent?.trim() || '';
    }
  }

  // --- 3. Experience ---
  const experiences: Experience[] = [];
  const expSection = getSectionByTitle('Experience');

  if (expSection) {
    const items = getListItems(expSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim() || '')
        .filter(text => text.length > 0);

      const uniqueLines = [...new Set(visualLines)];

      if (uniqueLines.length >= 2) {
        const title = uniqueLines[0];
        let company = uniqueLines[1];
        let startDate = '';
        let endDate = '';
        let loc = '';
        let description = '';

        const dateLineIndex = uniqueLines.findIndex(txt => /\d{4}/.test(txt) || txt.toLowerCase().includes('present'));

        if (dateLineIndex > -1) {
          const dateText = uniqueLines[dateLineIndex];
          const dates = parseDateRange(dateText);
          startDate = dates.startDate;
          endDate = dates.endDate;

          if (dateLineIndex > 1) {
            company = uniqueLines[dateLineIndex - 1];
            if (company.includes(' yr') || company.includes(' mo')) {
              company = uniqueLines[0];
            }
          }

          if (uniqueLines[dateLineIndex + 1]) {
            const possibleLoc = uniqueLines[dateLineIndex + 1];
            if (possibleLoc.length < 50 && !possibleLoc.includes('·')) {
              loc = possibleLoc;
            }
          }

          // Extract description: Look for longer text after metadata
          // Description is typically >60 chars and doesn't look like dates/durations/locations
          const metadataEndIndex = loc ? dateLineIndex + 2 : dateLineIndex + 1;
          const descriptionLines = uniqueLines.slice(metadataEndIndex).filter(line => {
            // Skip short lines that look like metadata
            if (line.length < 40) return false;
            // Skip lines that look like durations (e.g., "2 yrs 3 mos")
            if (/^\d+\s*(yr|mo|year|month)/i.test(line)) return false;
            // Skip lines that look like "See more" or "Show more"
            if (/^(see|show)\s*(more|less)/i.test(line)) return false;
            // Skip skill tags
            if (line.startsWith('Skills:')) return false;
            return true;
          });

          if (descriptionLines.length > 0) {
            description = descriptionLines.join('\n\n');
          }
        }

        company = company.split('·')[0].trim();

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
      }
    });
  }

  const currentExp = experiences.find(e => e.endDate?.toLowerCase() === 'present');
  const currentCompany = currentExp ? currentExp.company : (experiences.length > 0 ? experiences[0].company : '');

  // --- 4. Education ---
  const educations: Education[] = [];
  const eduSection = getSectionByTitle('Education');

  if (eduSection) {
    const items = getListItems(eduSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim() || '')
        .filter(text => text.length > 0);

      const uniqueLines = [...new Set(visualLines)];

      if (uniqueLines.length >= 1) {
        const school = uniqueLines[0];
        let degree = '';
        let field = '';
        let endDate = '';

        if (uniqueLines.length > 1) {
          const degreeField = uniqueLines[1];
          const parts = degreeField.split(',').map(p => p.trim());
          degree = parts[0] || '';
          field = parts[1] || '';
        }

        const dateLine = uniqueLines.find(txt => /\d{4}/.test(txt));
        if (dateLine) {
          const yearMatch = dateLine.match(/[-–]\s*(\d{4})/);
          if (yearMatch) {
            endDate = yearMatch[1];
          } else {
            const singleYear = dateLine.match(/(\d{4})/);
            if (singleYear) endDate = singleYear[1];
          }
        }

        educations.push({ school, degree, field, endDate });
      }
    });
  }

  // --- 5. Skills ---
  const skills: string[] = [];
  const skillsSection = getSectionByTitle('Skills');
  if (skillsSection) {
    const items = getListItems(skillsSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim() || '')
        .filter(t => t);
      if (visualLines.length > 0) skills.push(visualLines[0]);
    });
  }

  // --- 6. Languages ---
  const languages: string[] = [];
  const langSection = getSectionByTitle('Languages');
  if (langSection) {
    const items = getListItems(langSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim() || '')
        .filter(t => t);
      if (visualLines.length > 0) languages.push(visualLines[0]);
    });
  }

  return {
    firstName: firstName || 'Unknown',
    lastName: lastName || '',
    headline,
    location,
    linkedinUrl: url,
    currentCompany,
    about,
    profilePictureUrl,
    experiences,
    educations,
    skills,
    languages
  };
};

/**
 * Checks if the current profile is a 1st degree connection.
 */
export const is1stDegreeConnection = (): boolean => {
  const degreeElement = document.querySelector('.dist-value');
  if (degreeElement?.textContent?.includes('1st')) return true;

  const distanceSpan = document.querySelector('span.text-body-small');
  if (distanceSpan?.textContent?.includes('1st')) return true;

  const badge = document.querySelector('[class*="distance-badge"]');
  if (badge?.textContent?.includes('1st')) return true;

  return false;
};

/**
 * Helper to wait for an element to appear in the DOM.
 */
const waitForElement = (selector: string, timeout: number = 3000): Promise<Element | null> => {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
};

/**
 * Scrapes contact info (email, phone) by opening the Contact Info modal.
 * Only works for 1st degree connections.
 */
export const scrapeContactInfo = async (): Promise<{ email?: string; phone?: string }> => {
  console.log('[Lumina Parser] Attempting to scrape contact info...');

  const styleId = 'lumina-hide-modal';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .artdeco-modal-overlay,
      .artdeco-modal,
      .artdeco-modal__content,
      section.pv-contact-info,
      div[role="dialog"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: scale(0.1) !important;
      }
    `;
    document.head.appendChild(style);
  }

  const contactLink = document.querySelector('a[href*="contact-info"]') as HTMLAnchorElement ||
    document.querySelector('#top-card-text-details-contact-info') as HTMLAnchorElement ||
    Array.from(document.querySelectorAll('a, span')).find(el =>
      el.textContent?.toLowerCase().trim() === 'contact info'
    ) as HTMLAnchorElement;

  if (!contactLink) {
    console.log('[Lumina Parser] Contact info link not found');
    document.getElementById(styleId)?.remove();
    return {};
  }

  contactLink.click();

  const modal = await waitForElement('.artdeco-modal, section.pv-contact-info, div[role="dialog"]', 5000);

  if (!modal) {
    console.log('[Lumina Parser] Contact info modal did not appear');
    document.getElementById(styleId)?.remove();
    return {};
  }

  await new Promise(resolve => setTimeout(resolve, 800));

  let email: string | undefined;
  let phone: string | undefined;

  const extractData = (): boolean => {
    const modalEl = document.querySelector('.artdeco-modal, div[role="dialog"]');
    if (!modalEl) return false;

    const modalText = modalEl.textContent || '';

    // Email extraction
    const mailtoLink = modalEl.querySelector('a[href^="mailto:"]') as HTMLAnchorElement;
    if (!email && mailtoLink) {
      const mailtoHref = mailtoLink.getAttribute('href') || '';
      const candidate = mailtoHref.replace('mailto:', '').split('?')[0];
      if (candidate.includes('@')) {
        email = candidate;
      }
    }

    if (!email) {
      const allLinks = modalEl.querySelectorAll('a');
      for (const link of allLinks) {
        const text = link.textContent?.trim() || '';
        if (text.includes('@') && text.includes('.') && !text.includes(' ') && text.length > 5) {
          email = text;
          break;
        }
      }
    }

    if (!email) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = modalText.match(emailRegex);
      if (matches && matches.length > 0) {
        const validEmail = matches.find(e =>
          !e.includes('linkedin.com') &&
          !e.includes('example.com') &&
          e.length > 5
        );
        if (validEmail) {
          email = validEmail;
        }
      }
    }

    // Phone extraction
    const sections = modalEl.querySelectorAll('section, li, div.pv-contact-info__ci-container');
    for (const section of sections) {
      const headerText = section.textContent?.toLowerCase() || '';
      if (!phone && (headerText.includes('phone') || headerText.includes('mobile'))) {
        const textContent = section.textContent || '';
        const phoneRegex = /[\+]?[\d\s\-\(\)\.]{8,}/g;
        const matches = textContent.match(phoneRegex);

        if (matches) {
          for (const match of matches) {
            const cleaned = match.trim();
            const digitCount = (cleaned.match(/\d/g) || []).length;
            if (digitCount >= 7 && /^[\d\s\-\+\(\)\.]+$/.test(cleaned)) {
              phone = cleaned;
              break;
            }
          }
        }
      }
    }

    if (!phone) {
      const phoneRegex = /\+[\d\s\-\(\)]{8,}/g;
      const matches = modalText.match(phoneRegex);
      if (matches && matches.length > 0) {
        phone = matches[0].trim();
      }
    }

    return !!(email || phone);
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const success = extractData();
    if (success) break;
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }

  const closeButton = document.querySelector(
    'button[aria-label="Dismiss"], ' +
    'button.artdeco-modal__dismiss, ' +
    'button[data-test-modal-close-btn], ' +
    '.artdeco-modal button[aria-label*="close" i], ' +
    'button.artdeco-button--circle'
  ) as HTMLButtonElement;

  if (closeButton) {
    closeButton.click();
  } else {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }

  setTimeout(() => {
    document.getElementById(styleId)?.remove();
  }, 300);

  console.log('[Lumina Parser] Contact info result:', { email, phone });
  return { email, phone };
};
