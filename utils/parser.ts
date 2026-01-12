import { CandidateProfile, Experience, Education } from '../types';

/**
 * Helper to safely get text content from a specific selector within a root element.
 */
const getText = (root: Element | Document, selector: string): string => {
  const el = root.querySelector(selector);
  return el ? (el.textContent?.trim() || '') : '';
};

/**
 * Detects if the current page is LinkedIn Sales Navigator.
 */
export const isSalesNavigator = (): boolean => {
  const url = window.location.href;
  return url.includes('/sales/') || url.includes('linkedin.com/sales');
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
        // Sales Navigator (2024-2025 layout)
        'h1[class*="_headingText_"]',
        '[class*="_headingText_"][class*="_sizeXLarge_"]',
        '.profile-topcard-person-entity__name',
        '.profile-topcard h1',
        // Sales Navigator lead page indicators
        'main h1[class*="_headingText_"]',
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

  // Detect Sales Navigator and route to specialized parser
  if (isSalesNavigator()) {
    console.log('[Lumina Parser] Detected Sales Navigator, using specialized parser');
    return parseSalesNavigatorProfile();
  }

  // --- Regular LinkedIn Profile Parsing ---
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
      // Check if this is a "grouped" company entry with nested positions
      // LinkedIn uses nested lists when someone has multiple roles at the same company
      const nestedList = item.querySelector('ul.pvs-list, ul[class*="pvs-list"]');
      const nestedItems = nestedList ? Array.from(nestedList.querySelectorAll(':scope > li')) : [];

      // Extract potential company from parent for grouped entries
      let companyFromParent = '';
      if (nestedItems.length > 0) {
        const parentSpans = Array.from(item.querySelectorAll(':scope > div span[aria-hidden="true"]'))
          .map(el => el.textContent?.trim() || '')
          .filter(text => text.length > 0 && !text.includes(' yr') && !text.includes(' mo'));
        companyFromParent = parentSpans.length > 0 ? parentSpans[0].split('·')[0].trim() : '';
      }

      // Use grouped parsing ONLY if we have nested items AND successfully extracted company
      if (nestedItems.length > 0 && companyFromParent) {
        console.log('[Lumina Parser] Detected grouped company entry:', companyFromParent, 'with', nestedItems.length, 'nested positions');

        // Parse each nested position
        nestedItems.forEach(nestedItem => {
          const visualLines = Array.from(nestedItem.querySelectorAll('span[aria-hidden="true"]'))
            .map(el => el.textContent?.trim() || '')
            .filter(text => text.length > 0);

          const uniqueLines = [...new Set(visualLines)];

          if (uniqueLines.length >= 1) {
            // In nested structure: first line is the title (position), company comes from parent
            const title = uniqueLines[0];
            const company = companyFromParent;
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

              // Check for location after date
              if (uniqueLines[dateLineIndex + 1]) {
                const possibleLoc = uniqueLines[dateLineIndex + 1];
                if (possibleLoc.length < 50 && !possibleLoc.includes('·') &&
                  !possibleLoc.includes(' yr') && !possibleLoc.includes(' mo')) {
                  loc = possibleLoc;
                }
              }

              // Extract description
              const metadataEndIndex = loc ? dateLineIndex + 2 : dateLineIndex + 1;
              const descriptionLines = uniqueLines.slice(metadataEndIndex).filter(line => {
                if (line.length < 40) return false;
                if (/^\d+\s*(yr|mo|year|month)/i.test(line)) return false;
                if (/^(see|show)\s*(more|less)/i.test(line)) return false;
                if (line.startsWith('Skills:')) return false;
                return true;
              });

              if (descriptionLines.length > 0) {
                description = descriptionLines.join('\n\n');
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
          }
        });
      } else {
        // Standard single-position entry (original logic)
        // Also used as fallback when grouped detection fails
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

            // Extract description
            const metadataEndIndex = loc ? dateLineIndex + 2 : dateLineIndex + 1;
            const descriptionLines = uniqueLines.slice(metadataEndIndex).filter(line => {
              if (line.length < 40) return false;
              if (/^\d+\s*(yr|mo|year|month)/i.test(line)) return false;
              if (/^(see|show)\s*(more|less)/i.test(line)) return false;
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
 * Parses a Sales Navigator lead profile page.
 * Sales Navigator has a different DOM structure than regular LinkedIn profiles.
 */
export const parseSalesNavigatorProfile = (): CandidateProfile => {
  const url = window.location.href;
  console.log('[Lumina Parser] Parsing Sales Navigator profile...');

  // --- 1. Basic Info ---
  // Find the header element first (contains name, headline, location)
  const headerEl = document.querySelector('[class*="_header_"]');

  // Name: Try multiple strategies
  let fullName = '';

  // Strategy 1: span with _name_ class (most reliable)
  const nameSpan = document.querySelector('span[class*="_name_"]');
  if (nameSpan) {
    fullName = nameSpan.textContent?.trim() || '';
  }

  // Strategy 2: element with _headingText_ class (not necessarily h1)
  if (!fullName) {
    const headingTextEl = document.querySelector('[class*="_headingText_"]');
    if (headingTextEl) {
      const text = headingTextEl.textContent?.trim();
      if (text && !text.includes('Lead Page') && !text.includes('information for') && text.length < 60) {
        fullName = text;
      }
    }
  }

  // Strategy 3: h1 inside header that looks like a name (fallback)
  if (!fullName && headerEl) {
    const h1Els = headerEl.querySelectorAll('h1');
    for (const h of h1Els) {
      const text = h.textContent?.trim();
      if (text && !text.includes('Lead Page') && !text.includes('information for') &&
          !text.includes('insights') && text.length < 60) {
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

  // Headline: Find the job description text (usually contains @ or | for job titles)
  let headline = '';

  // Strategy 1: Look for headline in subhead div class
  const subheadEl = document.querySelector('div[class*="_subhead_"]');
  if (subheadEl) {
    const text = subheadEl.textContent?.trim();
    if (text && text.length > 20 && text.length < 300) {
      headline = text.replace(/\s+/g, ' ').trim();
    }
  }

  // Strategy 2: Look for paragraphs with @ symbol (job titles usually have Company @ Location pattern)
  if (!headline) {
    const paragraphs = document.querySelectorAll('p[class*="_bodyText_"], div[class*="_bodyText_"]');
    for (const p of paragraphs) {
      const text = p.textContent?.trim();
      // Look for job-description-like text with @ or | patterns
      if (text && text.length > 20 && text.length < 300 &&
          (text.includes('@') || text.includes('|') || text.includes('Engineer') || text.includes('Developer')) &&
          !text.includes('Message') && !text.includes('connection') &&
          !text.includes('warm introduction') && !text.includes('Show more')) {
        headline = text.replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }

  // Strategy 3: Fallback - just look for any substantial bodyText
  if (!headline) {
    const paragraphs = document.querySelectorAll('p[class*="_bodyText_"]');
    for (const p of paragraphs) {
      const text = p.textContent?.trim();
      if (text && text.length > 30 && text.length < 300 &&
          !text.includes('Message') && !text.includes('connection') &&
          !text.includes('introduction') && !text.includes('Show more')) {
        headline = text.replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }

  // Location: Find div containing location pattern (City, Country)
  // Sales Navigator uses div[class*="_bodyText_"] for location - search within header first
  let location = '';

  // Strategy 1: Search within header element for location div
  if (headerEl) {
    const headerDivs = headerEl.querySelectorAll('div[class*="_bodyText_"]');
    for (const d of headerDivs) {
      const text = d.textContent?.trim();
      // Location pattern: contains comma, reasonable length, looks like location
      if (text && text.includes(',') && text.length < 60 && text.length > 5 &&
          !text.includes('connection') && !text.includes('Viewed') &&
          !text.includes('@') && !text.includes('http') && !text.includes('|') &&
          !text.includes('Engineer') && !text.includes('Developer')) {
        location = text;
        break;
      }
    }
  }

  // Strategy 2: Look for elements containing known country/region patterns
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

  // Strategy 3: Fallback to global search
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

  // Profile Picture - find the actual profile photo (not background, not meta tag)
  // Meta tags can show wrong user, so search DOM first
  let profilePictureUrl = '';

  // Look for profile-displayphoto in img src (actual profile photos)
  const allImgs = document.querySelectorAll('img');
  for (const img of allImgs) {
    const src = (img as HTMLImageElement).src || '';
    // profile-displayphoto is the actual profile picture, not displaybackgroundimage
    if (src.includes('profile-displayphoto') && !src.includes('ghost') &&
        (img as HTMLImageElement).width >= 50) {
      profilePictureUrl = src;
      break;
    }
  }

  // Fallback: other profile picture selectors
  if (!profilePictureUrl) {
    const imgSelectors = [
      'img[alt*="profile picture" i]',
      'button[class*="profile-picture"] img',
      'img[class*="profile-photo"]'
    ];
    for (const selector of imgSelectors) {
      const img = document.querySelector(selector) as HTMLImageElement;
      if (img?.src && img.src.startsWith('http') && !img.src.includes('ghost') &&
          !img.src.includes('displaybackgroundimage')) {
        profilePictureUrl = img.src;
        break;
      }
    }
  }

  // Last resort: meta tag (may show wrong user in some cases)
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
  // Sales Navigator shows contact info in a dedicated section
  let email = '';
  let phone = '';

  // Strategy 1: Look for the contact-info section with data attribute
  const contactSection = document.querySelector('section[data-sn-view-name="lead-contact-info"]');
  if (contactSection) {
    // Phone: Look for tel: link
    const phoneLink = contactSection.querySelector('a[href^="tel:"]');
    if (phoneLink) {
      const phoneSpan = phoneLink.querySelector('span[data-anonymize="phone"]');
      if (phoneSpan) {
        phone = phoneSpan.textContent?.trim() || '';
      } else {
        // Fallback: extract from href
        const href = phoneLink.getAttribute('href') || '';
        phone = href.replace('tel:', '');
      }
    }

    // Email: Look for mailto: link
    const emailLink = contactSection.querySelector('a[href^="mailto:"]');
    if (emailLink) {
      const emailSpan = emailLink.querySelector('span[data-anonymize="email"]');
      if (emailSpan) {
        email = emailSpan.textContent?.trim() || '';
      } else {
        // Fallback: extract from href
        const href = emailLink.getAttribute('href') || '';
        email = href.replace('mailto:', '');
      }
    }
  }

  // Strategy 2: Fallback - search for Contact information heading
  if (!phone && !email) {
    const contactHeading = Array.from(document.querySelectorAll('h2, h3')).find(h =>
      h.textContent?.trim() === 'Contact information'
    );
    if (contactHeading) {
      const container = contactHeading.closest('section') || contactHeading.parentElement?.parentElement;
      if (container) {
        // Look for tel: and mailto: links
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

  console.log('[Lumina Parser] Contact info found:', { phone: phone ? 'Yes' : 'No', email: email ? 'Yes' : 'No' });

  // --- 2. About Section ---
  let about = '';
  const aboutHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.trim().toLowerCase() === 'about'
  );
  if (aboutHeading) {
    // Try section first, then parent elements
    const aboutSection = aboutHeading.closest('section') || aboutHeading.parentElement?.parentElement;
    if (aboutSection) {
      // Find text content after heading
      const aboutTexts = aboutSection.querySelectorAll('span, p, div');
      for (const el of aboutTexts) {
        const text = el.textContent?.trim();
        // Look for substantial text that's not a heading or button
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
  const expHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.toLowerCase().includes('experience') && !h.textContent?.includes('Shared')
  );

  if (expHeading) {
    // Try role="region" first, then fall back to section or parent
    const expSection = expHeading.closest('[role="region"]') || expHeading.closest('section') || expHeading.parentElement;
    const expList = expSection?.querySelector('ul, ol');
    const expItems = expList?.querySelectorAll(':scope > li[class*="_experience"], :scope > li');

    expItems?.forEach(item => {
      // Job title: h2 with _bodyText_ and _weightBold_ (excluding AI summary headings)
      let title = '';
      const headings = item.querySelectorAll('h2[class*="_bodyText_"]');
      for (const h of headings) {
        const text = h.textContent?.trim();
        if (text && !text.includes('How') && !text.includes('money') && !text.includes('Account') && text.length < 100) {
          title = text;
          break;
        }
      }

      // Company: link with mercado class or /sales/company/ href
      // Note: May have multiple company links - find one with actual text
      let company = '';
      const companyLinks = item.querySelectorAll('a[href*="/sales/company/"], a[href*="/company/"], a[class*="link--mercado"]');
      for (const link of companyLinks) {
        const linkText = link.textContent?.trim();
        if (linkText && linkText.length > 0 && linkText.length < 100) {
          company = linkText;
          break;
        }
      }

      // Dates and duration from spans
      let startDate = '';
      let endDate = '';
      let loc = '';
      let description = '';

      const spans = item.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim();
        if (!text) continue;

        // Date range pattern: "Jan 2024–Present" or "Aug 2019–Nov 2021"
        const dateMatch = text.match(/([A-Za-z]{3}\s\d{4}|[A-Za-z]+\s\d{4})\s*[–-]\s*(Present|[A-Za-z]{3}\s\d{4}|[A-Za-z]+\s\d{4})/i);
        if (dateMatch && !startDate) {
          const dates = parseDateRange(text);
          startDate = dates.startDate;
          endDate = dates.endDate;
          continue;
        }

        // Location pattern (after dates)
        if (text.includes(',') && text.length < 60 && !text.includes('–') && startDate) {
          if (!text.includes('yr') && !text.includes('mo') && !text.includes('Show')) {
            loc = text;
            continue;
          }
        }

        // Description: longer text that's not metadata
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

  const currentExp = experiences.find(e => e.endDate?.toLowerCase() === 'present');
  const currentCompany = currentExp ? currentExp.company : (experiences.length > 0 ? experiences[0].company : '');

  // --- 4. Education ---
  const educations: Education[] = [];
  const eduHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.trim().toLowerCase() === 'education'
  );

  if (eduHeading) {
    // Use section or parent element as container
    const eduSection = eduHeading.closest('section') || eduHeading.parentElement?.parentElement;
    const eduList = eduSection?.querySelector('ul, ol');
    const eduItems = eduList?.querySelectorAll('li') || eduSection?.querySelectorAll('li');

    eduItems?.forEach(item => {
      // School name: usually in a heading or link
      const schoolLink = item.querySelector('a[href*="school"], a[href*="linkedin.com/school"]');
      const schoolHeading = item.querySelector('h2, h3');
      const school = schoolLink?.textContent?.trim() || schoolHeading?.textContent?.trim() || '';

      // Degree and field from spans
      let degree = '';
      let field = '';
      let endDate = '';

      const spans = item.querySelectorAll('span');
      const texts: string[] = [];
      spans.forEach(s => {
        const t = s.textContent?.trim();
        if (t && t.length > 1 && t.length < 100) texts.push(t);
      });

      // Look for degree/field (usually after school name)
      for (const text of texts) {
        if (text !== school && !text.match(/^\d{4}$/) && text.length > 3) {
          if (!degree) {
            degree = text;
          } else if (!field && text !== degree) {
            field = text;
          }
        }
        // Year pattern
        const yearMatch = text.match(/(\d{4})/);
        if (yearMatch) {
          endDate = yearMatch[1];
        }
      }

      if (school) {
        educations.push({ school, degree, field, endDate });
      }
    });
  }

  // --- 5. Skills ---
  const skills: string[] = [];
  const skillsHeading = Array.from(document.querySelectorAll('h2')).find(h =>
    h.textContent?.toLowerCase().includes('skill')
  );

  if (skillsHeading) {
    // Use section or parent element (Sales Navigator doesn't have role="region")
    const skillsSection = skillsHeading.closest('section') || skillsHeading.parentElement?.parentElement;
    const skillItems = skillsSection?.querySelectorAll('li');

    skillItems?.forEach(item => {
      let skillName = '';

      // Strategy 1: firstElementChild.textContent (common in Sales Navigator)
      const firstChild = item.firstElementChild;
      if (firstChild) {
        const text = firstChild.textContent?.trim();
        if (text && text.length > 1 && text.length < 60 &&
            !text.includes('endorsement') && !/^\d+$/.test(text)) {
          skillName = text;
        }
      }

      // Strategy 2: Look for skill name in span elements
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

      // Strategy 3: Fallback to any span without endorsement text
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
    // Use section or parent element (Sales Navigator doesn't have role="region")
    const langSection = langHeading.closest('section') || langHeading.parentElement?.parentElement;
    const langItems = langSection?.querySelectorAll('li');

    langItems?.forEach(item => {
      // Look for language name specifically
      const nameEl = item.querySelector('span[class*="_name_"], span[class*="_title_"]') ||
                     item.querySelector('span:first-child');

      if (nameEl) {
        const text = nameEl.textContent?.trim();
        // Language name (not proficiency level)
        if (text && text.length > 1 && text.length < 40 &&
            !text.toLowerCase().includes('proficiency') &&
            !text.toLowerCase().includes('fluent') &&
            !text.toLowerCase().includes('native') &&
            !text.toLowerCase().includes('elementary')) {
          languages.push(text);
        }
      } else {
        // Fallback: first span that looks like a language
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

  console.log('[Lumina Parser] Sales Navigator profile parsed:', { firstName, lastName, experiences: experiences.length, educations: educations.length, hasPhone: !!phone, hasEmail: !!email });

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
