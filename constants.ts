export const API_BASE_URL = 'https://lcvfhchrueipjtoudxit.supabase.co/functions/v1';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjdmZoY2hydWVpcGp0b3VkeGl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNzkyNDEsImV4cCI6MjA4Mzc1NTI0MX0.p2paiXI8pXH31fkkNK644greiI-TJRSqXNyInSRoJZI';
export const APP_DOMAIN = 'https://app.yena.ai';

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
