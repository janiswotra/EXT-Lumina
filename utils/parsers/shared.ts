/**
 * Helper to safely get text content from a specific selector within a root element.
 */
export const getText = (root: Element | Document, selector: string): string => {
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
        // Generic fallback - any h1/h2 in main content area
        'main h1',
        '.scaffold-layout__main h1',
        // 2025/2026 LinkedIn layout - name moved to h2
        'main h2',
      ];

      for (const selector of nameSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent?.trim()) {
          clearInterval(intervalId);
          resolve(true);
          return;
        }
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
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
  const scrollPositions = [300, 600, 1000, 1500, 2000, 2500, 3000];

  for (const pos of scrollPositions) {
    window.scrollTo({ top: pos, behavior: 'instant' as ScrollBehavior });
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // Return to top for consistent state
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  await new Promise(resolve => setTimeout(resolve, 100));
};

/**
 * Finds a section element based on the text content of its header.
 */
export const getSectionByTitle = (titleKeyword: string): HTMLElement | null => {
  // Strategy 1: Classic LinkedIn sections with <section> tags
  const sections = Array.from(document.querySelectorAll('section'));
  const found = sections.find(section => {
    const header = section.querySelector('div[id*="header"] h1, h2, span, h1');
    if (header && header.textContent) {
      return header.textContent.trim().toLowerCase().includes(titleKeyword.toLowerCase());
    }
    return false;
  });
  if (found) return found;

  // Strategy 2 (2025/2026): Find h2 with the section title, then return its closest parent container
  const h2s = Array.from(document.querySelectorAll('h2'));
  for (const h2 of h2s) {
    const text = h2.textContent?.trim() || '';
    if (text.toLowerCase().includes(titleKeyword.toLowerCase())) {
      // Walk up to find a meaningful container (section, div with list items)
      const section = h2.closest('section');
      if (section) return section;
      // Try parent containers that have list items
      let parent = h2.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        if (parent.querySelector('ul') || parent.querySelectorAll('li').length > 0) {
          return parent;
        }
        parent = parent.parentElement;
      }
      // Fallback: return the h2's grandparent
      return h2.parentElement?.parentElement as HTMLElement || null;
    }
  }

  return null;
};

/**
 * Extracts list items from a given section element.
 */
export const getListItems = (section: HTMLElement): Element[] => {
  if (!section) return [];
  // Classic LinkedIn classes
  let items = section.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item');
  if (items.length > 0) return Array.from(items);
  // 2025/2026 fallback: any direct li items in the section's ul
  const ul = section.querySelector('ul');
  if (ul) {
    items = ul.querySelectorAll(':scope > li');
    if (items.length > 0) return Array.from(items);
  }
  // Any li elements in the section
  items = section.querySelectorAll('li');
  if (items.length > 0) return Array.from(items);

  // 2025/2026 div-based layout: LinkedIn wraps items in nested divs instead of ul/li.
  // Try increasing nesting depths — pick the level that yields multiple items.
  let bestItems: Element[] = [];
  for (let depth = 2; depth <= 5; depth++) {
    const sel = ':scope' + ' > div'.repeat(depth);
    const divItems = Array.from(section.querySelectorAll(sel));
    const meaningful = divItems.filter(div => {
      const texts = getVisualLines(div);
      return texts.length >= 2;
    });
    if (meaningful.length > 1) return meaningful;
    if (meaningful.length === 1 && bestItems.length === 0) {
      bestItems = meaningful;
    }
  }
  if (bestItems.length > 0) return bestItems;

  return [];
};

/**
 * Extracts visible text lines from a list item element.
 * Works with both old (span[aria-hidden="true"]) and new (2025/2026 leaf text) LinkedIn layouts.
 */
export const getVisualLines = (item: Element): string[] => {
  // Try old pattern first
  const ariaSpans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
    .map(el => el.textContent?.trim() || '')
    .filter(t => t.length > 0);
  if (ariaSpans.length > 0) return [...new Set(ariaSpans)];

  // 2025/2026: extract unique leaf text nodes (elements with no children)
  const leafTexts: string[] = [];
  const allEls = Array.from(item.querySelectorAll('*'));
  for (const el of allEls) {
    if (el.children.length === 0) {
      const t = (el.textContent || '').trim();
      if (t && t.length > 1) leafTexts.push(t);
    }
  }
  // Deduplicate preserving order
  const seen = new Set<string>();
  return leafTexts.filter(t => {
    if (seen.has(t)) return false;
    seen.add(t);
    // Filter out UI noise
    const lower = t.toLowerCase();
    if (lower === 'more' || lower === 'less' || lower === 'show more' || lower === 'show less') return false;
    if (t.startsWith('+') && t.length <= 3) return false; // "+2" etc
    return true;
  });
};

/**
 * Converts date string like "Jan 2020" or "2020" to "YYYY-MM" format
 */
export const formatDate = (dateStr: string): string => {
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
export const parseDateRange = (text: string): { startDate: string; endDate: string } => {
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
