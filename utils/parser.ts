import { CandidateProfile, Experience, Education } from '../types';

/**
 * Helper to safely get text content from a specific selector within a root element.
 * It prioritizes aria-hidden="true" spans which typically contain the visible text 
 * without hidden screen-reader duplicates.
 */
const getText = (root: Element | Document, selector: string): string => {
  const el = root.querySelector(selector);
  return el ? (el.textContent?.trim() || '') : '';
};

/**
 * Finds a section element based on the text content of its header (h1, h2, span).
 * This is more robust than relying on dynamic IDs like 'ember123'.
 */
const getSectionByTitle = (titleKeyword: string): HTMLElement | null => {
  const sections = Array.from(document.querySelectorAll('section'));

  return sections.find(section => {
    // Look for headers within the section
    const header = section.querySelector('div[id*="header"] h1, h2, span, h1');
    if (header && header.textContent) {
      return header.textContent.trim().toLowerCase().includes(titleKeyword.toLowerCase());
    }
    return false;
  }) || null;
};

/**
 * Extracts list items from a given section element.
 * Matches the structure: ul > li.artdeco-list__item
 */
const getListItems = (section: HTMLElement): Element[] => {
  if (!section) return [];
  // The structure is usually section -> div.pvs-list__container -> div -> ul -> li
  const items = section.querySelectorAll('li.artdeco-list__item, li.pvs-list__paged-list-item');
  return Array.from(items);
};

export const parseProfile = (): CandidateProfile => {
  const url = window.location.href;

  // --- 1. Basic Info ---
  // Name is typically in an H1 with specific typography classes
  const nameSelector = 'h1.text-heading-xlarge, h1.t-24';
  const fullName = getText(document, nameSelector) || getText(document, '.pv-text-details__left-panel h1');

  let firstName = '';
  let lastName = '';

  if (fullName) {
    const parts = fullName.split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  // Headline
  const headline = getText(document, '.text-body-medium.break-words');

  // Location
  const location = getText(document, '.text-body-small.inline.t-black--light.break-words');

  // Profile Picture
  const imgEl = document.querySelector('img.pv-top-card-profile-picture__image--show') as HTMLImageElement;
  let profilePictureUrl = imgEl?.src;

  // If no specific class, try a generic one but exclude ghost images if possible (though LinkedIn usually serves a ghost URL)
  if (!profilePictureUrl) {
    const genericImg = document.querySelector('.pv-top-card-profile-picture__image') as HTMLImageElement;
    if (genericImg) profilePictureUrl = genericImg.src;
  }

  // --- 2. Experience ---
  const experiences: Experience[] = [];
  const expSection = getSectionByTitle('Experience');

  if (expSection) {
    const items = getListItems(expSection);

    items.forEach(item => {
      // Robust Heuristic:
      // LinkedIn list items usually contain multiple lines of text in span[aria-hidden="true"] elements.
      // We collect all such visible text nodes.
      // Order is typically: Role, Company, Date • Duration, Location.
      // Or for Education: School, Degree, Dates.

      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim())
        .filter(text => text && text.length > 0);

      // Remove duplicates that might occur due to nested accessibility spans (though aria-hidden="true" usually targets the visual one)
      const uniqueLines = [...new Set(visualLines)];

      if (uniqueLines.length >= 1) {
        // Heuristic mapping
        const title = uniqueLines[0];
        let company = '';
        let dates = '';
        let location = '';

        // Try to find company (usually 2nd line)
        if (uniqueLines.length > 1) company = uniqueLines[1];

        // Try to find dates (usually contains numbers or 'Present')
        // We iterate from index 2 to find a date-like string
        const dateIndex = uniqueLines.findIndex((txt, idx) => idx >= 2 && (/\d{4}/.test(txt) || txt.includes('Present') || txt.includes(' mo') || txt.includes(' yr')));
        if (dateIndex !== -1) {
          dates = uniqueLines[dateIndex];
          // Location is often the one after dates implies context
          if (uniqueLines[dateIndex + 1]) location = uniqueLines[dateIndex + 1];
        } else if (uniqueLines.length > 2) {
          // Fallback: assume 3rd line is dates/location mixed
          dates = uniqueLines[2];
        }

        experiences.push({
          title,
          company,
          dates,
          location
        });
      }
    });
  }

  // Deduce current company
  // If the first experience says "Present", use that company
  const currentExp = experiences.find(e => e.dates?.toLowerCase().includes('present'));
  const currentCompany = currentExp ? currentExp.company.split('·')[0].trim() : (experiences.length > 0 ? experiences[0].company.split('·')[0].trim() : '');

  // --- 3. Education ---
  const educations: Education[] = [];
  const eduSection = getSectionByTitle('Education');

  if (eduSection) {
    const items = getListItems(eduSection);

    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim())
        .filter(text => text && text.length > 0);

      const uniqueLines = [...new Set(visualLines)];

      if (uniqueLines.length >= 1) {
        const school = uniqueLines[0];
        let degree = '';
        let dates = '';

        if (uniqueLines.length > 1) degree = uniqueLines[1];

        // Find line with date range (e.g. 2018 - 2022)
        const dateLine = uniqueLines.find((txt, idx) => idx >= 1 && /\d{4}/.test(txt));
        if (dateLine) dates = dateLine;

        educations.push({ school, degree, dates });
      }
    });
  }

  // --- 4. Skills ---
  const skills: string[] = [];
  const skillsSection = getSectionByTitle('Skills');

  if (skillsSection) {
    const items = getListItems(skillsSection);

    items.forEach(item => {
      // Usually just the first line is the skill name
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim())
        .filter(text => text && text.length > 0);

      if (visualLines.length > 0) {
        skills.push(visualLines[0]);
      }
    });
  }

  // --- 5. Languages ---
  const languages: string[] = [];
  const langSection = getSectionByTitle('Languages');

  if (langSection) {
    const items = getListItems(langSection);
    items.forEach(item => {
      const visualLines = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map(el => el.textContent?.trim())
        .filter(text => text && text.length > 0);

      if (visualLines.length > 0) {
        // First line is usually Language name (e.g. English)
        // Second line might be proficiency (e.g. Native or bilingual proficiency)
        // We just capture the name for now, or maybe "Name - Proficiency"
        const lang = visualLines[0];
        const proficiency = visualLines[1];
        languages.push(proficiency ? `${lang} (${proficiency})` : lang);
      }
    });
  }

  return {
    firstName: firstName || 'Unknown',
    lastName: lastName || '',
    headline,
    location,
    linkedInUrl: url,
    currentCompany,
    profilePictureUrl,
    experiences,
    educations,
    skills,
    languages
  };
};
