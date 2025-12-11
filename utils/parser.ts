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

  // --- 2. Experience ---
  const experiences: Experience[] = [];
  const expSection = getSectionByTitle('Experience');
  
  if (expSection) {
    const items = getListItems(expSection);
    
    items.forEach(item => {
      // Based on provided snippet:
      // Title: .mr1.hoverable-link-text.t-bold span[aria-hidden="true"]
      // Company: .t-14.t-normal span[aria-hidden="true"] (first occurrence)
      // Dates: .t-14.t-normal.t-black--light span[aria-hidden="true"]
      
      const titleEl = item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]');
      // Sometimes the title is nested differently if it's a multi-role chain, but this is the primary anchor
      
      const companyEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
      const datesEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
      const locationEl = item.querySelectorAll('.t-14.t-normal.t-black--light span[aria-hidden="true"]')[1]; // Location is often the second span in the meta block

      const title = titleEl?.textContent?.trim() || '';
      // If company text includes " · Full-time", we might want to clean it, but keeping it raw is often safer
      const company = companyEl?.textContent?.trim() || ''; 
      const dates = datesEl?.textContent?.trim() || '';
      
      // If we found a title, valid entry
      if (title) {
        experiences.push({
          title,
          company,
          dates,
          location: locationEl?.textContent?.trim()
        });
      }
    });
  }

  // Deduce current company
  // If the first experience says "Present", use that company
  const currentExp = experiences.find(e => e.dates?.toLowerCase().includes('present'));
  const currentCompany = currentExp ? currentExp.company.split('·')[0].trim() : (experiences[0]?.company?.split('·')[0].trim() || '');

  // --- 3. Education ---
  const educations: Education[] = [];
  const eduSection = getSectionByTitle('Education');
  
  if (eduSection) {
    const items = getListItems(eduSection);
    
    items.forEach(item => {
      // School: .mr1.hoverable-link-text.t-bold span[aria-hidden="true"]
      // Degree: .t-14.t-normal span[aria-hidden="true"]
      // Dates: .t-14.t-normal.t-black--light span[aria-hidden="true"]

      const schoolEl = item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]');
      const degreeEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
      const datesEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');

      const school = schoolEl?.textContent?.trim() || '';
      const degree = degreeEl?.textContent?.trim() || '';
      const dates = datesEl?.textContent?.trim() || '';

      if (school) {
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
      // Skill name: .mr1.hoverable-link-text.t-bold span[aria-hidden="true"]
      const skillEl = item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]');
      const skill = skillEl?.textContent?.trim();
      
      if (skill) {
        skills.push(skill);
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
    experiences,
    educations,
    skills
  };
};
