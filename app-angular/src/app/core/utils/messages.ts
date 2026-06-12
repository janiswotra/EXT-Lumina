import { LinkedInMessage } from '../types';

// LinkedIn conversation scraping — framework-agnostic DOM logic ported from
// the React contentMessages content script.

export const isSalesNav = (): boolean => window.location.href.includes('/sales/');

export const generateMessageId = (senderName: string, timestamp: string, text: string): string => {
  const input = `${senderName}|${timestamp}|${text.substring(0, 100)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `li-msg-${Math.abs(hash).toString(36)}`;
};

export const parseRelativeTimestamp = (relativeText: string): string => {
  const now = new Date();
  const text = relativeText.trim().toLowerCase();
  if (text === 'just now' || text === 'now') return now.toISOString();

  const match = text.match(
    /^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)\s*(?:ago)?$/,
  );
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const result = new Date(now);
    if (unit.startsWith('s')) result.setSeconds(result.getSeconds() - amount);
    else if (unit.startsWith('mo') || unit === 'month' || unit === 'months') result.setMonth(result.getMonth() - amount);
    else if (unit === 'm' || unit.startsWith('min')) result.setMinutes(result.getMinutes() - amount);
    else if (unit.startsWith('h')) result.setHours(result.getHours() - amount);
    else if (unit.startsWith('d')) result.setDate(result.getDate() - amount);
    else if (unit.startsWith('w')) result.setDate(result.getDate() - amount * 7);
    else if (unit.startsWith('y')) result.setFullYear(result.getFullYear() - amount);
    return result.toISOString();
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return now.toISOString();
};

const getLoggedInUserName = (): string => {
  const navImg = document.querySelector('img.global-nav__me-photo') as HTMLImageElement;
  if (navImg?.alt) return navImg.alt.trim();
  const navText = document.querySelector('.global-nav__me-content .t-14');
  if (navText?.textContent) return navText.textContent.trim();
  return '';
};

const isEncodedProfileUrl = (url: string): boolean => {
  const match = url.match(/\/in\/([^/?]+)/);
  if (!match) return false;
  const slug = match[1];
  return /^A[A-Z][a-zA-Z0-9_-]{20,}$/.test(slug);
};

export const getParticipantInfo = (scope: Element): { url: string; name: string } => {
  const loggedInUser = getLoggedInUserName().toLowerCase().split(' ')[0];

  if (isSalesNav()) {
    const currentUrl = window.location.href;
    if (currentUrl.includes('/sales/lead/')) {
      const nameEl = document.querySelector(
        '#message-overlay h2, .profile-topcard-person-entity__name, [data-anonymize="person-name"]',
      );
      const name = nameEl?.textContent?.trim() || '';
      return { url: currentUrl.split('?')[0], name };
    }
    const salesLeadLink = document.querySelector(
      '.inbox__right-rail-container a[href*="/sales/lead/"], a[href*="/sales/lead/"][data-control-name="view_profile"]',
    ) as HTMLAnchorElement;
    const threadHeading = scope.querySelector('#thread-route-heading, .thread__header h2');
    const name = threadHeading?.textContent?.trim() || '';
    if (salesLeadLink?.href) return { url: salesLeadLink.href, name };
    const salesProfileLink = document.querySelector(
      'a[href*="/sales/lead/"], a[href*="/sales/people/"]',
    ) as HTMLAnchorElement;
    if (salesProfileLink?.href) return { url: salesProfileLink.href, name };
  }

  const senderLinks = scope.querySelectorAll(
    '[class*="msg-s-message-group__name"], a[href*="/in/"].msg-s-message-group__name, .msg-s-event-listitem__profile-picture',
  );
  for (const el of Array.from(senderLinks)) {
    const link = (el.tagName === 'A' ? el : el.closest('a') || el.querySelector('a')) as HTMLAnchorElement;
    if (!link?.href?.includes('/in/')) continue;
    const name = link.textContent?.trim() || '';
    if (loggedInUser && name.toLowerCase().includes(loggedInUser)) continue;
    if (!isEncodedProfileUrl(link.href)) return { url: link.href, name };
  }

  const allMsgLinks = scope.querySelectorAll(
    '.msg-s-message-list-content a[href*="/in/"], .msg-s-event-listitem a[href*="/in/"]',
  ) as NodeListOf<HTMLAnchorElement>;
  for (const link of Array.from(allMsgLinks)) {
    if (isEncodedProfileUrl(link.href)) continue;
    const name = link.textContent?.trim() || '';
    if (loggedInUser && name.toLowerCase().includes(loggedInUser)) continue;
    if (name) return { url: link.href, name };
  }

  const overlayHeaderLink = scope.querySelector(
    '.msg-overlay-bubble-header__title a[href*="/in/"]',
  ) as HTMLAnchorElement;
  if (overlayHeaderLink?.href) return { url: overlayHeaderLink.href, name: overlayHeaderLink.textContent?.trim() || '' };

  const threadHeaderLink = scope.querySelector(
    '.msg-thread__link-to-profile, a[href*="/in/"].msg-thread__topcard-btn, a[href*="/in/"][data-control-name="topcard"]',
  ) as HTMLAnchorElement;
  if (threadHeaderLink?.href) return { url: threadHeaderLink.href, name: threadHeaderLink.textContent?.trim() || '' };

  const allProfileLinks = scope.querySelectorAll('a[href*="/in/"]') as NodeListOf<HTMLAnchorElement>;
  for (const link of Array.from(allProfileLinks)) {
    if (link.closest('.global-nav')) continue;
    if (isEncodedProfileUrl(link.href)) continue;
    return { url: link.href, name: link.textContent?.trim() || '' };
  }
  for (const link of Array.from(allProfileLinks)) {
    if (link.closest('.global-nav')) continue;
    return { url: link.href, name: link.textContent?.trim() || '' };
  }

  return { url: '', name: '' };
};

export const autoScrollForFullHistory = (container: Element): Promise<void> => {
  const MAX_SCROLL_TIME = 30000;
  const SCROLL_PAUSE = 500;
  const MAX_MESSAGES = 200;
  const startTime = Date.now();

  return new Promise<void>((resolve) => {
    const scrollStep = () => {
      if (Date.now() - startTime > MAX_SCROLL_TIME) {
        resolve();
        return;
      }
      const topMarker = container.querySelector('[class*="msg-s-message-list__top-of-list"]');
      if (topMarker) {
        resolve();
        return;
      }
      const messageCount = container.querySelectorAll('[class*="msg-s-event-listitem"]').length;
      if (messageCount >= MAX_MESSAGES) {
        resolve();
        return;
      }
      container.scrollTop = 0;
      setTimeout(scrollStep, SCROLL_PAUSE);
    };
    scrollStep();
  });
};

const scrapeMessagesSalesNav = (scope: Element): LinkedInMessage[] => {
  const loggedInUser = getLoggedInUserName();
  const messages: LinkedInMessage[] = [];
  const messageItems = scope.querySelectorAll(
    '.message-content, [class*="message-content"], [class*="message-item"], [data-view-name*="message"]',
  );
  const filtered = Array.from(messageItems).filter((item) => {
    const cls = item.className?.toString() || '';
    return !cls.includes('date-boundary') && !cls.includes('upload') && !cls.includes('form');
  });

  let currentSender = 'Unknown';
  let currentTimestamp = new Date().toISOString();

  for (const item of filtered) {
    const senderEl = item.querySelector(
      '[data-anonymize="person-name"], [class*="sender"], [class*="author"], [class*="participant"], [class*="name"] a, strong',
    );
    if (senderEl?.textContent?.trim()) currentSender = senderEl.textContent.trim();

    const timeEl = item.querySelector('time, [class*="timestamp"], [datetime]');
    if (timeEl) {
      const raw = timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || '';
      currentTimestamp = raw.includes('T') ? raw : parseRelativeTimestamp(raw);
    }

    const bodyEl = item.querySelector('[class*="message-body"], [class*="message-text"], [class*="body"], p');
    const text = bodyEl?.textContent?.trim() || '';

    if (!text) {
      const clone = item.cloneNode(true) as Element;
      clone
        .querySelectorAll('time, [class*="timestamp"], [class*="name"], [class*="sender"], button, [class*="reaction"]')
        .forEach((el) => el.remove());
      const fallbackText = clone.textContent?.trim() || '';
      if (fallbackText.length < 2) continue;
      messages.push({
        id: generateMessageId(currentSender, currentTimestamp, fallbackText),
        text: fallbackText,
        senderName: currentSender,
        isOutbound: loggedInUser ? currentSender.toLowerCase().includes(loggedInUser.toLowerCase().split(' ')[0]) : false,
        timestamp: currentTimestamp,
      });
      continue;
    }

    if (text.length < 2) continue;
    messages.push({
      id: generateMessageId(currentSender, currentTimestamp, text),
      text,
      senderName: currentSender,
      isOutbound: loggedInUser ? currentSender.toLowerCase().includes(loggedInUser.toLowerCase().split(' ')[0]) : false,
      timestamp: currentTimestamp,
    });
  }
  return messages;
};

export const scrapeMessages = (scope: Element): LinkedInMessage[] => {
  if (isSalesNav()) return scrapeMessagesSalesNav(scope);

  const loggedInUser = getLoggedInUserName();
  const messages: LinkedInMessage[] = [];
  const messageGroups = scope.querySelectorAll('[class*="msg-s-message-group"]');

  for (const group of Array.from(messageGroups)) {
    const senderEl = group.querySelector('[class*="msg-s-message-group__name"]');
    const senderName = senderEl?.textContent?.trim() || 'Unknown';
    const timestampEl = group.querySelector('[class*="msg-s-message-group__timestamp"], time');
    const rawTimestamp = timestampEl?.getAttribute('datetime') || timestampEl?.textContent?.trim() || '';
    const timestamp = rawTimestamp.includes('T') ? rawTimestamp : parseRelativeTimestamp(rawTimestamp);
    const isOutbound = loggedInUser ? senderName.toLowerCase().includes(loggedInUser.toLowerCase().split(' ')[0]) : false;

    const messageItems = group.querySelectorAll('[class*="msg-s-event-listitem__body"]');
    for (const item of Array.from(messageItems)) {
      const text = item.textContent?.trim() || '';
      if (!text) continue;
      messages.push({ id: generateMessageId(senderName, timestamp, text), text, senderName, isOutbound, timestamp });
    }
  }

  if (messages.length === 0) {
    const eventItems = scope.querySelectorAll('[class*="msg-s-event-listitem"]');
    let currentSender = 'Unknown';
    let currentTimestamp = new Date().toISOString();
    for (const item of Array.from(eventItems)) {
      const nameEl = item.querySelector('[class*="msg-s-message-group__name"]');
      if (nameEl?.textContent?.trim()) currentSender = nameEl.textContent.trim();
      const timeEl = item.querySelector('[class*="msg-s-message-group__timestamp"], time');
      if (timeEl) {
        const raw = timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || '';
        currentTimestamp = raw.includes('T') ? raw : parseRelativeTimestamp(raw);
      }
      const bodyEl = item.querySelector('[class*="msg-s-event-listitem__body"]');
      const text = bodyEl?.textContent?.trim() || '';
      if (!text) continue;
      const isOutbound = loggedInUser
        ? currentSender.toLowerCase().includes(loggedInUser.toLowerCase().split(' ')[0])
        : false;
      messages.push({
        id: generateMessageId(currentSender, currentTimestamp, text),
        text,
        senderName: currentSender,
        isOutbound,
        timestamp: currentTimestamp,
      });
    }
  }

  return messages;
};

export const getActiveConversation = (): Element | null => {
  const activeOverlay = document.querySelector(
    '.msg-overlay-conversation-bubble--is-active[data-msg-overlay-conversation-bubble-is-minimized="false"]',
  );
  if (activeOverlay) return activeOverlay;

  if (isSalesNav()) {
    const snMessageOverlay = document.querySelector('#message-overlay');
    if (snMessageOverlay) {
      const convoContainer = snMessageOverlay.querySelector('[class*="conversation-container"]');
      if (convoContainer) return convoContainer;
      return snMessageOverlay;
    }
    const threadContainer = document.querySelector('.thread-container');
    if (threadContainer) return threadContainer;
  }

  if (window.location.href.includes('/messaging/')) {
    const threadWrapper = document.querySelector('.msg-convo-wrapper.msg-thread');
    if (threadWrapper) return threadWrapper;
    const convoWrapper = document.querySelector('.msg-convo-wrapper');
    if (convoWrapper) return convoWrapper;
  }

  return null;
};

export const findFormInConversation = (conversation: Element): Element | null => {
  const form = conversation.querySelector('form.msg-form');
  if (form) return form;
  const msgForm = conversation.querySelector('.msg-form');
  if (msgForm) return msgForm;
  const snForm = conversation.querySelector('form');
  if (snForm) return snForm;
  return null;
};

export const messageScrapeContainerSelector =
  '[class*="msg-s-message-list-content"], [class*="msg-s-message-list"], .msg-s-message-list, [class*="message-list"], [class*="thread-content"]';
