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
            let title = uniqueLines[0];
            const company = companyFromParent;
            let startDate = '';
            let endDate = '';
            let loc = '';
            let description = '';

            // Extract title from "Title at Company" format if present
            if (title.includes(' at ')) {
              const parts = title.split(' at ');
              title = parts[0].trim();
            }

            // Employment type keywords to filter out
            const employmentTypes = ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'self-employed', 'seasonal', 'temporary'];
            const workLocationTypes = ['on-site', 'remote', 'hybrid'];

            const dateLineIndex = uniqueLines.findIndex(txt => /\d{4}/.test(txt) || txt.toLowerCase().includes('present'));

            if (dateLineIndex > -1) {
              const dateText = uniqueLines[dateLineIndex];
              const dates = parseDateRange(dateText);
              startDate = dates.startDate;
              endDate = dates.endDate;

              // Check for location after date
              if (uniqueLines[dateLineIndex + 1]) {
                const possibleLoc = uniqueLines[dateLineIndex + 1];
                const lower = possibleLoc.toLowerCase();
                if (possibleLoc.length < 50 &&
                    !possibleLoc.includes('·') &&
                    !possibleLoc.includes(' yr') &&
                    !possibleLoc.includes(' mo') &&
                    !employmentTypes.includes(lower) &&
                    !workLocationTypes.includes(lower)) {
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
          let title = '';
          let company = '';
          let startDate = '';
          let endDate = '';
          let loc = '';
          let description = '';

          // Employment type keywords to filter out (LinkedIn 2024/2025 structure)
          const employmentTypes = ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'self-employed', 'seasonal', 'temporary'];
          const workLocationTypes = ['on-site', 'remote', 'hybrid'];

          // --- NEW: Detect company-first structure ---
          // Pattern: Line 0 = Company, Line 1 = "Full-time · X yrs", Line 2 = Title
          const line0 = uniqueLines[0];
          const line1 = uniqueLines[1] || '';
          const line2 = uniqueLines[2] || '';

          const line1Lower = line1.toLowerCase();
          const isLine1Metadata = employmentTypes.some(type => line1Lower.includes(type)) ||
                                  line1.includes(' yr') ||
                                  line1.includes(' mo');

          // Check if this is company-first structure
          if (!line0.includes(' at ') && isLine1Metadata && line2 && uniqueLines.length >= 3) {
            // Company-first pattern detected
            company = line0.trim();
            title = line2.trim();
          } else {
            // Original pattern: "Title at Company" or title-first
            title = line0;

            // Extract company from title if it contains " at " (e.g., "Partner (M&A) at MCF Corporate Finance")
            if (title.includes(' at ')) {
              const parts = title.split(' at ');
              if (parts.length === 2) {
                title = parts[0].trim();
                company = parts[1].trim();
              }
            }

            // If company not found in title, look for it in subsequent lines
            if (!company) {
              // Filter out employment types and location types
              const filteredLines = uniqueLines.slice(1).filter(line => {
                const lower = line.toLowerCase();
                return !employmentTypes.includes(lower) &&
                       !workLocationTypes.includes(lower) &&
                       !line.includes(' yr') &&
                       !line.includes(' mo');
              });

              // First filtered line should be the company (before dates)
              if (filteredLines.length > 0) {
                company = filteredLines[0];
              }
            }
          }

          const dateLineIndex = uniqueLines.findIndex(txt => /\d{4}/.test(txt) || txt.toLowerCase().includes('present'));

          if (dateLineIndex > -1) {
            const dateText = uniqueLines[dateLineIndex];
            const dates = parseDateRange(dateText);
            startDate = dates.startDate;
            endDate = dates.endDate;

            // If company still not found, look before date line (fallback)
            if (!company && dateLineIndex > 1) {
              const candidateCompany = uniqueLines[dateLineIndex - 1];
              const lower = candidateCompany.toLowerCase();
              if (!employmentTypes.includes(lower) &&
                  !workLocationTypes.includes(lower) &&
                  !candidateCompany.includes(' yr') &&
                  !candidateCompany.includes(' mo')) {
                company = candidateCompany;
              }
            }

            // Check for location after date
            if (uniqueLines[dateLineIndex + 1]) {
              const possibleLoc = uniqueLines[dateLineIndex + 1];
              const lower = possibleLoc.toLowerCase();
              // Location should not be employment type or work location type
              if (possibleLoc.length < 50 &&
                  !possibleLoc.includes('·') &&
                  !employmentTypes.includes(lower) &&
                  !workLocationTypes.includes(lower)) {
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

  // --- 7. Certifications ---
  const certifications: any[] = [];
  const certSection = getSectionByTitle('Licenses & certifications') || getSectionByTitle('Certifications');
  if (certSection) {
    const items = getListItems(certSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim() || '')
        .filter(t => t);

      if (visualLines.length > 0) {
        const name = visualLines[0];
        const issuer = visualLines.length > 1 ? visualLines[1] : undefined;
        const issueDate = visualLines.find(line => /\d{4}/.test(line));

        certifications.push({
          name,
          issuer,
          issueDate
        });
      }
    });
  }

  // --- 8. Courses ---
  const courses: any[] = [];
  const courseSection = getSectionByTitle('Courses');
  if (courseSection) {
    const items = getListItems(courseSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim() || '')
        .filter(t => t);

      if (visualLines.length > 0) {
        const name = visualLines[0];
        const institution = visualLines.length > 1 ? visualLines[1] : undefined;

        courses.push({
          name,
          institution
        });
      }
    });
  }

  // --- 9. Organizations ---
  const organizations: any[] = [];
  const orgSection = getSectionByTitle('Organizations');
  if (orgSection) {
    const items = getListItems(orgSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim() || '')
        .filter(t => t);

      if (visualLines.length > 0) {
        const name = visualLines[0];
        const role = visualLines.length > 1 ? visualLines[1] : undefined;

        organizations.push({
          name,
          role
        });
      }
    });
  }

  // --- 10. Connection Degree ---
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
    organizations
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

  // Helper function to check if text looks like a person's name
  const looksLikePersonName = (text: string): boolean => {
    if (!text || text.length < 3 || text.length > 50) return false;

    const words = text.trim().split(/\s+/);
    // Person names are typically 2-4 words
    if (words.length < 2 || words.length > 5) return false;

    // Each word should start with uppercase (names are capitalized)
    const allCapitalized = words.every(word => /^[A-Z]/.test(word));
    if (!allCapitalized) return false;

    // Should not contain numbers
    if (/\d/.test(text)) return false;

    // Should not contain special business characters
    if (/[&@#$%]/.test(text)) return false;

    return true;
  };

  // Helper function to check if text looks like a company name rather than a person
  const looksLikeCompanyName = (text: string): boolean => {
    if (!text) return false;
    // Common company name patterns
    const companyPatterns = [
      /\s&\s/,           // Contains " & " (Rothschild & Co)
      /\bCo\.?$/i,        // Ends with "Co" or "Co."
      /\bLtd\.?$/i,       // Ends with "Ltd" or "Ltd."
      /\bInc\.?$/i,       // Ends with "Inc" or "Inc."
      /\bLLC$/i,          // Ends with "LLC"
      /\bGmbH$/i,         // German company
      /\bAG$/i,           // German/Swiss company
      /\bPlc\.?$/i,       // British company
      /\bCorp\.?$/i,      // Corporation
      /\bGroup$/i,        // Group
      /\bPartners$/i,     // Partners (e.g., Fortlane Partners)
      /\bCapital$/i,      // Capital (e.g., Barclays Capital)
      /\bBank$/i,         // Bank
      /\bFinance$/i,      // Finance (e.g., MCF Corporate Finance)
      /\bCorporate\b/i,   // Contains "Corporate"
      /\bConsulting$/i,   // Consulting
      /\bAdvisors?$/i,    // Advisor/Advisors
      /\bHoldings?$/i,    // Holding/Holdings
      /\bVentures?$/i,    // Venture/Ventures
      /\bServices$/i,     // Services
      /\bSolutions$/i,    // Solutions
      /\bTechnolog(y|ies)$/i, // Technology/Technologies
      /\bManagement$/i,   // Management
      /\bInvestments?$/i, // Investment/Investments
    ];
    return companyPatterns.some(pattern => pattern.test(text));
  };

  // Strategy 1: Look for profile topcard name element (specific to lead pages)
  const profileNameEl = document.querySelector('[data-x--lead-name], [class*="profile-topcard"] [class*="_name_"]');
  if (profileNameEl) {
    const text = profileNameEl.textContent?.trim();
    if (text && looksLikePersonName(text) && !looksLikeCompanyName(text)) {
      fullName = text;
    }
  }

  // Strategy 2: span with _name_ class but NOT inside company/account sections
  // Prioritize elements that look like person names
  if (!fullName) {
    const nameSpans = document.querySelectorAll('span[class*="_name_"]');
    const candidates: string[] = [];
    for (const span of nameSpans) {
      const text = span.textContent?.trim();
      // Skip if it's inside an account/company section
      const isInsideCompanySection = span.closest('[class*="account"], [class*="company"], [class*="_savedAccount_"]');
      if (text && !isInsideCompanySection && text.length < 60) {
        candidates.push(text);
      }
    }
    // First pass: find one that looks like a person name
    for (const text of candidates) {
      if (looksLikePersonName(text) && !looksLikeCompanyName(text)) {
        fullName = text;
        break;
      }
    }
    // Second pass: fall back to any that doesn't look like company
    if (!fullName) {
      for (const text of candidates) {
        if (!looksLikeCompanyName(text)) {
          fullName = text;
          break;
        }
      }
    }
  }

  // Strategy 3: element with _headingText_ class (not necessarily h1)
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

  // Strategy 4: h1 inside header that looks like a name (fallback)
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

  console.log('[Lumina Parser] Sales Navigator name detected:', fullName, '| firstName:', firstName, '| lastName:', lastName);

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

      // Fallback: If no company link found, try to extract from spans
      // Company is usually the second line after the title in Sales Navigator
      if (!company) {
        const allSpans = Array.from(item.querySelectorAll('span')).map(s => s.textContent?.trim() || '').filter(t => t.length > 0);
        // Look for company-like text that's not a date, duration, or location
        for (const text of allSpans) {
          // Skip if it's the title we already found
          if (text === title) continue;
          // Skip dates, durations, locations
          if (/\d{4}/.test(text)) continue; // Has year
          if (/\d+\s*(yr|mo|year|month)/i.test(text)) continue; // Duration
          if (text.includes('Present')) continue;
          if (text.length > 100) continue; // Too long, probably description
          if (text.includes('Show more') || text.includes('Show less')) continue;
          // Skip if it looks like a location (has comma and common location words)
          if (text.includes(',') && (text.includes('Germany') || text.includes('United') || text.includes('Area') || text.includes('Remote'))) continue;
          // This might be the company name
          if (text.length >= 2 && text.length < 80) {
            company = text;
            break;
          }
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

        // Date range pattern: "Jan 2024–Present", "Aug 2019–Nov 2021", or "2006–2009"
        const dateMatch = text.match(/([A-Za-z]{3}\s\d{4}|[A-Za-z]+\s\d{4}|\d{4})\s*[–-]\s*(Present|[A-Za-z]{3}\s\d{4}|[A-Za-z]+\s\d{4}|\d{4})/i);
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

  // Helper to identify if text looks like a school/university name
  const looksLikeSchoolName = (text: string): boolean => {
    if (!text || text.length < 3) return false;
    const schoolPatterns = [
      /university/i,
      /college/i,
      /school/i,
      /institute/i,
      /academy/i,
      /polytechnic/i,
      /hochschule/i,     // German
      /universit[äaà]/i, // German/French/Italian
      /^MIT$/i,
      /^LSE$/i,
      /^UCLA$/i,
      /^NYU$/i,
      /^ETH/i,
      /^INSEAD$/i,
      /^HEC$/i,
      /^LBS$/i,          // London Business School
      /^WBS$/i,          // Warwick Business School
    ];
    return schoolPatterns.some(pattern => pattern.test(text));
  };

  // Helper to identify if text looks like a degree
  const looksLikeDegree = (text: string): boolean => {
    if (!text || text.length < 2) return false;
    const degreePatterns = [
      /^BA\b/i, /^BS\b/i, /^BSc\b/i, /^BBA\b/i, /^BCom\b/i,
      /^MA\b/i, /^MS\b/i, /^MSc\b/i, /^MBA\b/i, /^MPhil\b/i,
      /^PhD\b/i, /^Dr\.?\b/i, /^JD\b/i, /^LLB\b/i, /^LLM\b/i,
      /^Bachelor/i, /^Master/i, /^Doctor/i,
      /\(hons?\)/i,       // "(hons)" or "(hon)"
      /honours?/i,        // "honours" or "honor"
      /degree/i,
      /diploma/i,
      /certificate/i,
    ];
    return degreePatterns.some(pattern => pattern.test(text));
  };

  // Helper to identify if text looks like a field of study
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
    // Use section or parent element as container
    const eduSection = eduHeading.closest('section') || eduHeading.closest('[role="region"]') || eduHeading.parentElement?.parentElement;
    const eduList = eduSection?.querySelector('ul, ol');
    const eduItems = eduList?.querySelectorAll(':scope > li') || eduSection?.querySelectorAll('li');

    eduItems?.forEach(item => {
      // Collect all text elements
      const allTexts: string[] = [];

      // Priority 1: Links to schools
      const schoolLink = item.querySelector('a[href*="school"], a[href*="linkedin.com/school"], a[href*="/company/"]');
      if (schoolLink?.textContent?.trim()) {
        allTexts.push(schoolLink.textContent.trim());
      }

      // Priority 2: H2/H3 headings
      const headings = item.querySelectorAll('h2, h3');
      headings.forEach(h => {
        const t = h.textContent?.trim();
        if (t && !allTexts.includes(t)) allTexts.push(t);
      });

      // Priority 3: All spans
      const spans = item.querySelectorAll('span');
      spans.forEach(s => {
        const t = s.textContent?.trim();
        if (t && t.length > 1 && t.length < 100 && !allTexts.includes(t)) {
          allTexts.push(t);
        }
      });

      // Deduplicate and filter
      const uniqueTexts = [...new Set(allTexts)].filter(t =>
        t.length > 1 && !t.includes('Show more') && !t.includes('Show less')
      );

      // Identify school, degree, field, date
      let school = '';
      let degree = '';
      let field = '';
      let endDate = '';

      for (const text of uniqueTexts) {
        // Check for year
        const yearMatch = text.match(/(\d{4})/);
        if (yearMatch && !endDate) {
          // Extract just the end year from date ranges like "2015 - 2019"
          const rangeMatch = text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
          if (rangeMatch) {
            endDate = rangeMatch[2]; // Get the end year
          } else {
            endDate = yearMatch[1];
          }
          continue;
        }

        // Check for school (university, college, etc.)
        if (!school && looksLikeSchoolName(text)) {
          school = text;
          continue;
        }

        // Check for degree (BA, MSc, MBA, etc.)
        if (looksLikeDegree(text)) {
          if (!degree) {
            degree = text;
          } else if (text !== degree) {
            // Combine if we have multiple degree-like entries (e.g., "BA" + "(hons)")
            degree = degree + ' ' + text;
          }
          continue;
        }

        // Check for field of study
        if (!field && looksLikeFieldOfStudy(text)) {
          field = text;
          continue;
        }
      }

      // Fallback: if no school identified, use the first substantial non-degree text
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

      // If we found a school OR we have meaningful education data, add it
      if (school || (degree && degree.length > 2)) {
        educations.push({ school: school || '', degree, field, endDate });
        console.log('[Lumina Parser] Education parsed:', { school, degree, field, endDate });
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

  // --- 7. Connection Degree ---
  const connectionDegree = getConnectionDegree();

  // Sales Navigator doesn't show certifications, courses, or organizations
  // So we return empty arrays for these fields
  const certifications: any[] = [];
  const courses: any[] = [];
  const organizations: any[] = [];

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

/**
 * Extracts the connection degree from the current profile.
 * Returns "1st", "2nd", "3rd", "1st+", or empty string if not found.
 */
export const getConnectionDegree = (): string => {
  // Strategy 1: Look for .dist-value element (most reliable)
  const degreeElement = document.querySelector('.dist-value');
  if (degreeElement?.textContent) {
    const text = degreeElement.textContent.trim();
    if (text === '1st' || text === '2nd' || text === '3rd' || text === '1st+') {
      return text;
    }
  }

  // Strategy 2: Look for distance-badge class
  const badge = document.querySelector('[class*="distance-badge"]');
  if (badge?.textContent) {
    const text = badge.textContent.trim();
    // Extract just the degree part (e.g., "1st" from "1st degree connection")
    const match = text.match(/(1st|2nd|3rd|1st\+)/);
    if (match) {
      return match[1];
    }
  }

  // Strategy 3: Look in text-body-small spans (fallback)
  const spans = document.querySelectorAll('span.text-body-small');
  for (const span of spans) {
    const text = span.textContent?.trim() || '';
    const match = text.match(/(1st|2nd|3rd|1st\+)/);
    if (match) {
      return match[1];
    }
  }

  return '';
};

/**
 * Checks if the current profile is a 1st degree connection.
 */
export const is1stDegreeConnection = (): boolean => {
  const degree = getConnectionDegree();
  return degree === '1st' || degree === '1st+';
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
