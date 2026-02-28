import { CandidateProfile, Experience, Education, Certification, Course, Organization } from '../../types';
import { getText, getSectionByTitle, getListItems, parseDateRange, getConnectionDegree } from './shared';
import { parseSalesNavigatorProfile } from './salesNav';
import { isSalesNavigator } from './shared';

export const parseProfile = (): CandidateProfile => {
  const url = window.location.href;

  // Detect Sales Navigator and route to specialized parser
  if (isSalesNavigator()) {
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

  // --- Extract Current Company from Profile Header (Top Card) ---
  let currentCompanyFromHeader = '';

  // Strategy 1: Button element with company link in top card (most common 2024/2025 layout)
  const companyButton = document.querySelector('button[aria-label*="Current company"]') as HTMLElement;
  if (companyButton) {
    currentCompanyFromHeader = companyButton.textContent?.trim() || '';
  }

  // Strategy 2: Link to company page in the top card section
  if (!currentCompanyFromHeader) {
    const topCardSection = document.querySelector('.pv-text-details__left-panel, .mt2.relative');
    if (topCardSection) {
      const companyLink = topCardSection.querySelector('a[href*="/company/"]') as HTMLAnchorElement;
      if (companyLink) {
        currentCompanyFromHeader = companyLink.textContent?.trim() || '';
      }
    }
  }

  // Strategy 3: Span with data attribute for experience section link in header
  if (!currentCompanyFromHeader) {
    const experienceLink = document.querySelector('[data-field="experience_company_logo"] + div span, button[id*="experience"] span[aria-hidden="true"]');
    if (experienceLink) {
      currentCompanyFromHeader = experienceLink.textContent?.trim() || '';
    }
  }

  // Strategy 4: Direct text from top card area (second line often has company info)
  if (!currentCompanyFromHeader) {
    const topCardTexts = document.querySelectorAll('.pv-text-details__left-panel ul li button span[aria-hidden="true"], .mt2 ul li button span[aria-hidden="true"]');
    for (const el of topCardTexts) {
      const text = el.textContent?.trim() || '';
      if (text &&
        !text.toLowerCase().includes('connection') &&
        !text.toLowerCase().includes('follower') &&
        !text.includes(' yr') &&
        !text.includes(' mo') &&
        text.length > 2 &&
        text.length < 100) {
        currentCompanyFromHeader = text;
        break;
      }
    }
  }

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

        // Parse each nested position
        nestedItems.forEach(nestedItem => {
          const visualLines = Array.from(nestedItem.querySelectorAll('span[aria-hidden="true"]'))
            .map(el => el.textContent?.trim() || '')
            .filter(text => text.length > 0);

          const uniqueLines = [...new Set(visualLines)];

          if (uniqueLines.length >= 1) {
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

          const employmentTypes = ['full-time', 'part-time', 'contract', 'freelance', 'internship', 'self-employed', 'seasonal', 'temporary'];
          const workLocationTypes = ['on-site', 'remote', 'hybrid'];

          const line0 = uniqueLines[0];
          const line1 = uniqueLines[1] || '';
          const line2 = uniqueLines[2] || '';

          const line1Lower = line1.toLowerCase();

          const line1StartsWithMetadata = employmentTypes.some(type =>
            line1Lower.startsWith(type) || line1Lower.startsWith(type + ' ')
          );

          const line1HasCompanyWithMetadata = !line1StartsWithMetadata &&
            line1.includes('·') &&
            employmentTypes.some(type => line1Lower.includes(type));

          const looksLikeJobTitle = (text: string): boolean => {
            if (!text) return false;
            const titleKeywords = ['analyst', 'manager', 'director', 'engineer', 'developer', 'designer',
              'consultant', 'specialist', 'coordinator', 'associate', 'partner',
              'executive', 'officer', 'lead', 'head', 'senior', 'junior', 'intern',
              'advisor', 'president', 'founder', 'ceo', 'cto', 'cfo', 'vp', 'chief'];
            const lower = text.toLowerCase();
            return titleKeywords.some(kw => lower.includes(kw)) || (text.includes('(') && text.includes(')'));
          };

          // CASE A: "Title at Company" pattern in line0
          if (line0.includes(' at ')) {
            const parts = line0.split(' at ');
            if (parts.length === 2) {
              title = parts[0].trim();
              company = parts[1].trim();
            }
          }
          // CASE B: Title-first with "Company · Employment" in line1
          else if ((looksLikeJobTitle(line0) || line1HasCompanyWithMetadata) && line1) {
            title = line0.trim();
            if (line1.includes('·')) {
              company = line1.split('·')[0].trim();
            } else {
              company = line1.trim();
            }
          }
          // CASE C: Company-first with pure metadata in line1 ("Full-time · 9 yrs")
          else if (!looksLikeJobTitle(line0) && line1StartsWithMetadata && line2 && uniqueLines.length >= 3) {
            company = line0.trim();
            title = line2.trim();
          }
          // CASE D: Company-first with title in line1 (no metadata)
          else if (!looksLikeJobTitle(line0) && looksLikeJobTitle(line1) &&
            line2 && (/\d{4}/.test(line2) || line2.toLowerCase().includes('present'))) {
            company = line0.trim();
            title = line1.trim();
          } else {
            // FALLBACK: Assume title-first
            title = line0;

            if (!company && line1) {
              if (line1.includes('·')) {
                const beforeDot = line1.split('·')[0].trim();
                if (!employmentTypes.some(t => beforeDot.toLowerCase() === t)) {
                  company = beforeDot;
                }
              } else {
                const filteredLines = uniqueLines.slice(1).filter(line => {
                  const lower = line.toLowerCase();
                  return !employmentTypes.includes(lower) &&
                    !workLocationTypes.includes(lower) &&
                    !line.includes(' yr') &&
                    !line.includes(' mo') &&
                    !/^\d{4}/.test(line);
                });

                if (filteredLines.length > 0) {
                  company = filteredLines[0];
                }
              }
            }
          }

          const dateLineIndex = uniqueLines.findIndex(txt => /\d{4}/.test(txt) || txt.toLowerCase().includes('present'));

          if (dateLineIndex > -1) {
            const dateText = uniqueLines[dateLineIndex];
            const dates = parseDateRange(dateText);
            startDate = dates.startDate;
            endDate = dates.endDate;

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

            if (uniqueLines[dateLineIndex + 1]) {
              const possibleLoc = uniqueLines[dateLineIndex + 1];
              const lower = possibleLoc.toLowerCase();
              if (possibleLoc.length < 50 &&
                !possibleLoc.includes('·') &&
                !employmentTypes.includes(lower) &&
                !workLocationTypes.includes(lower)) {
                loc = possibleLoc;
              }
            }

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

  const currentCompanyFromExperience = currentExp ? currentExp.company : '';
  const currentCompany = currentCompanyFromHeader || currentCompanyFromExperience;

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
  const certifications: Certification[] = [];
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
  const courses: Course[] = [];
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
  const organizations: Organization[] = [];
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
