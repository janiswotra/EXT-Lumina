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

  const styleId = 'yena-hide-modal';
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
    document.getElementById(styleId)?.remove();
    return {};
  }

  contactLink.click();

  const modal = await waitForElement('.artdeco-modal, section.pv-contact-info, div[role="dialog"]', 5000);

  if (!modal) {
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

  return { email, phone };
};
