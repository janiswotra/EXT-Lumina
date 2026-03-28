import { getSectionByTitle } from './shared';

const SECTION_KEYWORDS: Record<string, string> = {
  about: 'About',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  languages: 'Languages',
  certifications: 'Licenses & certifications',
  courses: 'Courses',
  organizations: 'Organizations',
  recommendations: 'Recommendations',
};

/**
 * Clicks "...more" buttons inside known profile sections.
 * No scrolling — works silently in the existing DOM.
 */
export async function clickMoreInSections(): Promise<void> {
  for (const keyword of Object.values(SECTION_KEYWORDS)) {
    const section = getSectionByTitle(keyword);
    if (section) clickMoreButtonsInElement(section);
  }

  if (!getSectionByTitle(SECTION_KEYWORDS.certifications)) {
    const section = getSectionByTitle('Certifications');
    if (section) clickMoreButtonsInElement(section);
  }

  await new Promise(r => setTimeout(r, 400));

  // Second pass for nested "more" buttons
  for (const keyword of Object.values(SECTION_KEYWORDS)) {
    const section = getSectionByTitle(keyword);
    if (section) clickMoreButtonsInElement(section);
  }

  await new Promise(r => setTimeout(r, 200));
}

/**
 * Extracts innerText from each LinkedIn profile section.
 */
export function extractSectionTexts(): Record<string, string> {
  const sections: Record<string, string> = {};

  const header = extractHeaderText();
  if (header) sections.header = header;

  for (const [key, keyword] of Object.entries(SECTION_KEYWORDS)) {
    const el = getSectionByTitle(keyword);
    if (el) {
      const text = el.innerText?.trim();
      if (text) sections[key] = text;
    }
  }

  if (!sections.certifications) {
    const el = getSectionByTitle('Certifications');
    if (el) {
      const text = el.innerText?.trim();
      if (text) sections.certifications = text;
    }
  }

  return sections;
}

function clickMoreButtonsInElement(container: HTMLElement): void {
  const selectors = [
    'button.inline-show-more-text__button',
    'button.inline-show-more-text__button--light',
    '[class*="show-more-text"] button',
    'button[aria-expanded="false"]',
  ];

  for (const selector of selectors) {
    try {
      container.querySelectorAll(selector).forEach(btn => {
        try { (btn as HTMLElement).click(); } catch {}
      });
    } catch {}
  }

  const clickables = container.querySelectorAll('button, a, span[role="button"], [tabindex="0"]');
  for (const el of clickables) {
    const text = (el as HTMLElement).innerText?.trim().toLowerCase() || '';
    if (text === 'more' || text === '...more' || text === '… more' ||
        text === '...see more' || text === '… see more' ||
        text === 'see more' || text === 'show more') {
      try { (el as HTMLElement).click(); } catch {}
    }
  }
}

function extractHeaderText(): string {
  for (const selector of ['.pv-top-card', '.scaffold-layout__main > section:first-child', '.artdeco-card:first-child', 'main section:first-child', '[class*="top-card"]']) {
    const el = document.querySelector(selector) as HTMLElement;
    if (el) {
      const text = el.innerText?.trim();
      if (text && text.length > 10) return text;
    }
  }

  const mainEl = document.querySelector('main') as HTMLElement;
  if (mainEl) {
    const firstSection = mainEl.querySelector('section') as HTMLElement;
    if (firstSection) {
      const text = firstSection.innerText?.trim();
      if (text && text.length > 10) return text;
    }
  }

  return '';
}
