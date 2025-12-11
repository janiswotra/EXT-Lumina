export const API_BASE_URL = 'https://api.lumina-app.com/v1';
export const APP_DOMAIN = 'https://app.lumina-app.com';

// LinkedIn Selectors (Note: These are heuristic based as LI classes are obfuscated)
export const SELECTORS = {
  NAME_HEADING: 'h1.text-heading-xlarge', // Often the name
  HEADLINE: 'div.text-body-medium.break-words',
  LOCATION: 'span.text-body-small.inline.t-black--light.break-words',
  ABOUT_SECTION: '#about',
  EXPERIENCE_SECTION: '#experience',
  EDUCATION_SECTION: '#education',
  // The container where we want to inject our button (The action bar below profile pic)
  ACTION_BAR: '.ph5 .pv-top-card-v2-ctas', 
};
