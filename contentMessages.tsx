import React, { useState, useCallback, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LinkedInMessage, SyncMessagesPayload, ApiResponse } from './types';
import { isExtensionContextValid, safeSendMessage } from './utils/chrome';

// --- Message ID Generation (deterministic hash for dedup) ---
const generateMessageId = (senderName: string, timestamp: string, text: string): string => {
  const input = `${senderName}|${timestamp}|${text.substring(0, 100)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `li-msg-${Math.abs(hash).toString(36)}`;
};

// --- Relative timestamp parser ---
const parseRelativeTimestamp = (relativeText: string): string => {
  const now = new Date();
  const text = relativeText.trim().toLowerCase();

  // Match patterns like "2h", "3d", "1w", "5m", "1mo", "2y", "just now"
  if (text === 'just now' || text === 'now') {
    return now.toISOString();
  }

  const match = text.match(/^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)\s*(?:ago)?$/);
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

  // Try parsing as absolute date string
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  // Fallback: return current time
  return now.toISOString();
};


// --- DOM Scraping ---

/**
 * Get the logged-in user's name from the global nav or messaging sidebar.
 * Used to determine which messages are outbound.
 */
const getLoggedInUserName = (): string => {
  // Try global nav profile image alt text
  const navImg = document.querySelector('img.global-nav__me-photo') as HTMLImageElement;
  if (navImg?.alt) return navImg.alt.trim();

  // Try the nav menu text
  const navText = document.querySelector('.global-nav__me-content .t-14');
  if (navText?.textContent) return navText.textContent.trim();

  return '';
};

/**
 * Check if a /in/ URL uses an encoded URN format (e.g. /in/ACoAACPw0j8B...)
 * vs a vanity slug (e.g. /in/john-doe).
 * Encoded URNs start with uppercase letters and contain mixed case alphanumeric.
 */
const isEncodedProfileUrl = (url: string): boolean => {
  const match = url.match(/\/in\/([^/?]+)/);
  if (!match) return false;
  const slug = match[1];
  // Encoded URNs typically start with "ACo" or "ACw" and are long base64-like strings
  return /^A[A-Z][a-zA-Z0-9_-]{20,}$/.test(slug);
};

/**
 * Extract participant (the other person's) LinkedIn URL from the conversation.
 * Scoped to the given container (overlay bubble, full page thread, or Sales Nav thread).
 *
 * IMPORTANT: LinkedIn overlay headers use encoded URN URLs (/in/ACoAAC...) which
 * don't match vanity URLs (/in/username) stored in the DB. Message sender links
 * within the conversation use vanity URLs, so we prefer those.
 */
const getParticipantInfo = (scope: Element): { url: string; name: string } => {
  const loggedInUser = getLoggedInUserName().toLowerCase().split(' ')[0];

  // --- Sales Navigator ---
  if (isSalesNav()) {
    const currentUrl = window.location.href;
    if (currentUrl.includes('/sales/lead/')) {
      const nameEl = document.querySelector(
        '#message-overlay h2, .profile-topcard-person-entity__name, [data-anonymize="person-name"]'
      );
      const name = nameEl?.textContent?.trim() || '';
      return { url: currentUrl.split('?')[0], name };
    }

    const salesLeadLink = document.querySelector(
      '.inbox__right-rail-container a[href*="/sales/lead/"], ' +
      'a[href*="/sales/lead/"][data-control-name="view_profile"]'
    ) as HTMLAnchorElement;
    const threadHeading = scope.querySelector('#thread-route-heading, .thread__header h2');
    const name = threadHeading?.textContent?.trim() || '';

    if (salesLeadLink?.href) {
      return { url: salesLeadLink.href, name };
    }

    const salesProfileLink = document.querySelector('a[href*="/sales/lead/"], a[href*="/sales/people/"]') as HTMLAnchorElement;
    if (salesProfileLink?.href) {
      return { url: salesProfileLink.href, name };
    }
  }

  // --- Regular LinkedIn: prefer message sender links (vanity URLs) over header links (encoded URNs) ---

  // Strategy: find /in/ links attached to message sender names within this conversation.
  // These use vanity URLs. Pick one that isn't the logged-in user.
  const senderLinks = scope.querySelectorAll(
    '[class*="msg-s-message-group__name"], ' +
    'a[href*="/in/"].msg-s-message-group__name, ' +
    '.msg-s-event-listitem__profile-picture'
  );

  for (const el of senderLinks) {
    // The name element might be an <a> itself or contain one
    const link = (el.tagName === 'A' ? el : el.closest('a') || el.querySelector('a')) as HTMLAnchorElement;
    if (!link?.href?.includes('/in/')) continue;

    const name = link.textContent?.trim() || '';
    // Skip if this is the logged-in user's messages
    if (loggedInUser && name.toLowerCase().includes(loggedInUser)) continue;

    // Prefer vanity URLs, but accept any
    if (!isEncodedProfileUrl(link.href)) {
      console.log('[Yena Messages] Found vanity URL from message sender:', link.href);
      return { url: link.href, name };
    }
  }

  // Also scan all /in/ links in message items for vanity URLs
  const allMsgLinks = scope.querySelectorAll('.msg-s-message-list-content a[href*="/in/"], .msg-s-event-listitem a[href*="/in/"]') as NodeListOf<HTMLAnchorElement>;
  for (const link of allMsgLinks) {
    if (isEncodedProfileUrl(link.href)) continue;
    const name = link.textContent?.trim() || '';
    if (loggedInUser && name.toLowerCase().includes(loggedInUser)) continue;
    if (name) {
      console.log('[Yena Messages] Found vanity URL from message list:', link.href);
      return { url: link.href, name };
    }
  }

  // Fallback: overlay header (may be encoded URN — still better than nothing)
  const overlayHeaderLink = scope.querySelector(
    '.msg-overlay-bubble-header__title a[href*="/in/"]'
  ) as HTMLAnchorElement;
  if (overlayHeaderLink?.href) {
    console.log('[Yena Messages] Using overlay header URL (may be encoded):', overlayHeaderLink.href);
    return {
      url: overlayHeaderLink.href,
      name: overlayHeaderLink.textContent?.trim() || ''
    };
  }

  // Fallback: full messaging page thread header
  const threadHeaderLink = scope.querySelector(
    '.msg-thread__link-to-profile, ' +
    'a[href*="/in/"].msg-thread__topcard-btn, ' +
    'a[href*="/in/"][data-control-name="topcard"]'
  ) as HTMLAnchorElement;
  if (threadHeaderLink?.href) {
    return {
      url: threadHeaderLink.href,
      name: threadHeaderLink.textContent?.trim() || ''
    };
  }

  // Last resort: any /in/ link in scope that's a vanity URL
  const allProfileLinks = scope.querySelectorAll('a[href*="/in/"]') as NodeListOf<HTMLAnchorElement>;
  for (const link of allProfileLinks) {
    if (link.closest('.global-nav')) continue;
    if (isEncodedProfileUrl(link.href)) continue;
    return {
      url: link.href,
      name: link.textContent?.trim() || ''
    };
  }

  // Absolute last resort: any /in/ link
  for (const link of allProfileLinks) {
    if (link.closest('.global-nav')) continue;
    return {
      url: link.href,
      name: link.textContent?.trim() || ''
    };
  }

  return { url: '', name: '' };
};

/**
 * Auto-scroll the message container upward to load full history.
 * Returns when either the top marker is visible or timeout is reached.
 */
const autoScrollForFullHistory = async (container: Element): Promise<void> => {
  const MAX_SCROLL_TIME = 30000; // 30 seconds max
  const SCROLL_PAUSE = 500; // 500ms between scrolls
  const MAX_MESSAGES = 200;
  const startTime = Date.now();

  return new Promise<void>((resolve) => {
    const scrollStep = () => {
      // Check timeout
      if (Date.now() - startTime > MAX_SCROLL_TIME) {
        console.log('[Yena Messages] Scroll timeout reached, proceeding with available messages');
        resolve();
        return;
      }

      // Check if we've hit the top
      const topMarker = container.querySelector('[class*="msg-s-message-list__top-of-list"]');
      if (topMarker) {
        console.log('[Yena Messages] Reached top of conversation');
        resolve();
        return;
      }

      // Check message count cap
      const messageCount = container.querySelectorAll('[class*="msg-s-event-listitem"]').length;
      if (messageCount >= MAX_MESSAGES) {
        console.log(`[Yena Messages] Message cap reached (${messageCount}), proceeding`);
        resolve();
        return;
      }

      // Scroll up
      container.scrollTop = 0;

      // Wait then check again
      setTimeout(scrollStep, SCROLL_PAUSE);
    };

    scrollStep();
  });
};

/**
 * Scrape messages from Sales Navigator thread.
 * SN uses a different DOM structure than regular LinkedIn messaging.
 * Works for both /sales/inbox/ threads and /sales/lead/ messaging overlay.
 *
 * Sales Nav lead overlay structure:
 *   .message-content.relative.pv1  (each message)
 *     has sender info, timestamp, body text
 *
 * Sales Nav inbox structure:
 *   .message-item  / [class*="message-item"]
 */
const scrapeMessagesSalesNav = (scope: Element): LinkedInMessage[] => {
  const loggedInUser = getLoggedInUserName();
  const messages: LinkedInMessage[] = [];

  // Try multiple selector strategies for SN messages
  let messageItems = scope.querySelectorAll(
    '.message-content, [class*="message-content"], [class*="message-item"], [data-view-name*="message"]'
  );

  // Filter out date boundaries and non-message elements
  const filtered = Array.from(messageItems).filter(item => {
    const cls = item.className?.toString() || '';
    return !cls.includes('date-boundary') && !cls.includes('upload') && !cls.includes('form');
  });

  let currentSender = 'Unknown';
  let currentTimestamp = new Date().toISOString();

  for (const item of filtered) {
    // Look for sender name
    const senderEl = item.querySelector(
      '[data-anonymize="person-name"], [class*="sender"], [class*="author"], [class*="participant"], ' +
      '[class*="name"] a, strong'
    );
    if (senderEl?.textContent?.trim()) {
      currentSender = senderEl.textContent.trim();
    }

    // Look for timestamp
    const timeEl = item.querySelector('time, [class*="timestamp"], [datetime]');
    if (timeEl) {
      const raw = timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || '';
      currentTimestamp = raw.includes('T') ? raw : parseRelativeTimestamp(raw);
    }

    // Get message body text
    const bodyEl = item.querySelector(
      '[class*="message-body"], [class*="message-text"], [class*="body"], p'
    );
    const text = bodyEl?.textContent?.trim() || '';

    // If no body element found, try the item's own text minus sender/time
    if (!text) {
      // Clone and remove known non-body children to get just the message text
      const clone = item.cloneNode(true) as Element;
      clone.querySelectorAll('time, [class*="timestamp"], [class*="name"], [class*="sender"], button, [class*="reaction"]').forEach(el => el.remove());
      const fallbackText = clone.textContent?.trim() || '';
      if (fallbackText.length < 2) continue;

      messages.push({
        id: generateMessageId(currentSender, currentTimestamp, fallbackText),
        text: fallbackText,
        senderName: currentSender,
        isOutbound: loggedInUser
          ? currentSender.toLowerCase().includes(loggedInUser.toLowerCase().split(' ')[0])
          : false,
        timestamp: currentTimestamp,
      });
      continue;
    }

    if (text.length < 2) continue;

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

  console.log(`[Yena Messages] Sales Nav scrape found ${messages.length} messages from ${filtered.length} items`);
  return messages;
};

/**
 * Scrape all visible messages from the DOM.
 * Scoped to the given container (overlay bubble, full page thread, or Sales Nav thread).
 */
const scrapeMessages = (scope: Element): LinkedInMessage[] => {
  // Sales Navigator uses a completely different DOM structure
  if (isSalesNav()) {
    return scrapeMessagesSalesNav(scope);
  }

  const loggedInUser = getLoggedInUserName();
  const messages: LinkedInMessage[] = [];

  // Regular LinkedIn: find all message groups within scope
  const messageGroups = scope.querySelectorAll('[class*="msg-s-message-group"]');

  for (const group of messageGroups) {
    const senderEl = group.querySelector('[class*="msg-s-message-group__name"]');
    const senderName = senderEl?.textContent?.trim() || 'Unknown';

    const timestampEl = group.querySelector('[class*="msg-s-message-group__timestamp"], time');
    const rawTimestamp = timestampEl?.getAttribute('datetime') ||
                         timestampEl?.textContent?.trim() || '';
    const timestamp = rawTimestamp.includes('T')
      ? rawTimestamp
      : parseRelativeTimestamp(rawTimestamp);

    const isOutbound = loggedInUser
      ? senderName.toLowerCase().includes(loggedInUser.toLowerCase().split(' ')[0])
      : false;

    const messageItems = group.querySelectorAll('[class*="msg-s-event-listitem__body"]');

    for (const item of messageItems) {
      const text = item.textContent?.trim() || '';
      if (!text) continue;

      messages.push({
        id: generateMessageId(senderName, timestamp, text),
        text,
        senderName,
        isOutbound,
        timestamp,
      });
    }
  }

  // Fallback: flat list within scope
  if (messages.length === 0) {
    const eventItems = scope.querySelectorAll('[class*="msg-s-event-listitem"]');
    let currentSender = 'Unknown';
    let currentTimestamp = new Date().toISOString();

    for (const item of eventItems) {
      const nameEl = item.querySelector('[class*="msg-s-message-group__name"]');
      if (nameEl?.textContent?.trim()) {
        currentSender = nameEl.textContent.trim();
      }

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

// --- React Component ---

type SyncState = 'idle' | 'scrolling' | 'syncing' | 'done' | 'error';

const MessageSyncButton: React.FC = () => {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'ok' | 'missing'>('checking');

  // Check auth on mount
  useEffect(() => {
    safeSendMessage({ type: 'CHECK_AUTH' }).then((res) => {
      setAuthStatus(res?.success ? 'ok' : 'missing');
    });
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSync = useCallback(async () => {
    if (syncState === 'syncing' || syncState === 'scrolling') return;

    // Auth check
    if (authStatus === 'missing') {
      setToast({ msg: 'Please set your API key in the Yena extension first.', type: 'error' });
      return;
    }

    try {
      // Find the conversation context we're inside
      const conversation = getActiveConversation();
      if (!conversation) {
        setToast({ msg: 'No active conversation found.', type: 'error' });
        setSyncState('idle');
        return;
      }

      setSyncState('scrolling');

      // Find message container within this conversation and auto-scroll
      const container = conversation.querySelector(
        '[class*="msg-s-message-list-content"], ' +
        '[class*="msg-s-message-list"], ' +
        '.msg-s-message-list, ' +
        '[class*="message-list"], ' +
        '[class*="thread-content"]'
      );

      if (container) {
        await autoScrollForFullHistory(container);
      }

      setSyncState('syncing');

      // Scrape messages scoped to this conversation
      const messages = scrapeMessages(conversation);
      console.log(`[Yena Messages] Scraped ${messages.length} messages`);

      if (messages.length === 0) {
        setToast({ msg: 'No messages found in this conversation.', type: 'error' });
        setSyncState('idle');
        return;
      }

      // Get participant info scoped to this conversation
      const participant = getParticipantInfo(conversation);
      console.log('[Yena Messages] Participant info:', participant);
      if (!participant.url) {
        setToast({ msg: 'Could not find participant profile URL.', type: 'error' });
        setSyncState('idle');
        return;
      }

      // Build payload
      const payload: SyncMessagesPayload = {
        messages,
        conversationId: window.location.pathname,
        participantUrl: participant.url,
        participantName: participant.name,
      };
      console.log('[Yena Messages] Sending payload:', JSON.stringify({ participantUrl: payload.participantUrl, participantName: payload.participantName, messageCount: messages.length }));

      // Send to background
      const response: ApiResponse | null = await safeSendMessage({
        type: 'SYNC_MESSAGES',
        payload,
      });

      if (!response) {
        setToast({ msg: 'Failed to communicate with extension. Please refresh.', type: 'error' });
        setSyncState('error');
        return;
      }

      if (response.shouldAuth) {
        setToast({ msg: 'Please set your API key in the Yena extension.', type: 'error' });
        setSyncState('error');
        return;
      }

      if (!response.success) {
        setToast({ msg: response.message || 'Sync failed.', type: 'error' });
        setSyncState('error');
        return;
      }

      // Success
      const data = response.data;
      if (data?.candidateNotFound) {
        setToast({
          msg: 'No matching candidate found. Save them first with the Yena button.',
          type: 'error',
        });
        setSyncState('idle');
        return;
      }

      const syncedCount = data?.synced ?? messages.length;
      const skippedCount = data?.skipped ?? 0;
      const candidateName = data?.candidateName || participant.name;

      let successMsg = `${syncedCount} message${syncedCount !== 1 ? 's' : ''} synced`;
      if (candidateName) successMsg += ` to ${candidateName}`;
      if (skippedCount > 0) successMsg += ` (${skippedCount} already existed)`;

      setToast({ msg: successMsg, type: 'success' });
      setSyncState('done');

    } catch (err: any) {
      console.error('[Yena Messages] Sync error:', err);
      setToast({ msg: err.message || 'An error occurred during sync.', type: 'error' });
      setSyncState('error');
    }
  }, [syncState, authStatus]);

  const buttonLabel = {
    idle: 'Sync to Yena',
    scrolling: 'Loading messages...',
    syncing: 'Syncing...',
    done: 'Synced',
    error: 'Retry Sync',
  }[syncState];

  const isDone = syncState === 'done';
  const isDisabled = syncState === 'scrolling' || syncState === 'syncing' || isDone;
  const showSpinner = syncState === 'scrolling' || syncState === 'syncing';

  return (
    <>
      <button
        onClick={handleSync}
        disabled={isDisabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          backgroundColor: isDone ? 'rgba(5, 150, 105, 0.1)' : 'transparent',
          color: isDone ? '#059669' : '#666',
          border: `1px solid ${isDone ? '#059669' : '#ccc'}`,
          borderRadius: '16px',
          fontSize: '12px',
          fontWeight: 500,
          fontFamily: '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          cursor: isDisabled ? 'default' : 'pointer',
          opacity: isDisabled && !isDone ? 0.5 : 1,
          transition: 'all 150ms ease',
          lineHeight: '1.4',
        }}
        onMouseOver={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)';
            e.currentTarget.style.borderColor = '#999';
          }
        }}
        onMouseOut={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.backgroundColor = isDone ? 'rgba(5, 150, 105, 0.1)' : 'transparent';
            e.currentTarget.style.borderColor = isDone ? '#059669' : '#ccc';
          }
        }}
      >
        {showSpinner && (
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              border: '1.5px solid rgba(0,0,0,0.15)',
              borderTopColor: '#666',
              borderRadius: '50%',
              animation: 'yena-spin 0.6s linear infinite',
            }}
          />
        )}
        {isDone && <span style={{ fontSize: '11px' }}>&#10003;</span>}
        {!showSpinner && !isDone && isExtensionContextValid() && (
          <img
            src={chrome.runtime.getURL('icons/icon-16.png')}
            alt=""
            style={{ width: '12px', height: '12px', opacity: 0.7 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {buttonLabel}
      </button>

      {/* Inline keyframes for spinner */}
      <style>{`
        @keyframes yena-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 2147483647,
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: '1px solid',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: '13px',
            fontWeight: 500,
            maxWidth: '400px',
            pointerEvents: 'auto',
            ...(toast.type === 'success'
              ? { backgroundColor: '#064E3B', color: '#D1FAE5', borderColor: '#047857' }
              : { backgroundColor: '#7F1D1D', color: '#FEE2E2', borderColor: '#B91C1C' }),
          }}
        >
          <span style={{ marginRight: '10px', fontSize: '16px' }}>
            {toast.type === 'success' ? '\u2713' : '\u26A0'}
          </span>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              marginLeft: '12px',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '14px',
              opacity: 0.7,
            }}
          >
            \u2715
          </button>
        </div>
      )}
    </>
  );
};

// --- Injection Logic ---

let root: Root | null = null;
let injectionContainer: HTMLElement | null = null;
let isInjecting = false;
let currentConversationEl: Element | null = null; // Track which conversation we're injected into

const MOUNT_ID = 'yena-messages-mount';

console.log('[Yena Messages] Content script loaded on:', window.location.href);

/**
 * Detect if we're on Sales Navigator.
 */
const isSalesNav = (): boolean => window.location.href.includes('/sales/');

/**
 * Find the active conversation context.
 * Returns the container element that holds the conversation:
 *   - Regular LinkedIn overlay bubble (.msg-overlay-conversation-bubble)
 *   - Regular LinkedIn full messaging page (.msg-convo-wrapper)
 *   - Sales Navigator inbox thread (.thread-container)
 *   - Sales Navigator lead profile messaging overlay (#message-overlay)
 * Returns null if no conversation is currently visible.
 */
const getActiveConversation = (): Element | null => {
  // 1. Check for active, expanded overlay bubble (regular LinkedIn, ANY page)
  const activeOverlay = document.querySelector(
    '.msg-overlay-conversation-bubble--is-active[data-msg-overlay-conversation-bubble-is-minimized="false"]'
  );
  if (activeOverlay) return activeOverlay;

  // 2. Sales Navigator messaging overlay on lead/profile pages (#message-overlay)
  //    This is a separate overlay from regular LinkedIn's #msg-overlay
  if (isSalesNav()) {
    const snMessageOverlay = document.querySelector('#message-overlay');
    if (snMessageOverlay) {
      // Find the conversation container inside it
      const convoContainer = snMessageOverlay.querySelector('[class*="conversation-container"]');
      if (convoContainer) return convoContainer;
      // Fallback: use the overlay itself
      return snMessageOverlay;
    }

    // 3. Sales Navigator inbox thread (/sales/inbox/)
    const threadContainer = document.querySelector('.thread-container');
    if (threadContainer) return threadContainer;
  }

  // 4. Full messaging page thread (/messaging/)
  if (window.location.href.includes('/messaging/')) {
    const threadWrapper = document.querySelector('.msg-convo-wrapper.msg-thread');
    if (threadWrapper) return threadWrapper;
    const convoWrapper = document.querySelector('.msg-convo-wrapper');
    if (convoWrapper) return convoWrapper;
  }

  return null;
};

/**
 * Find the form/compose element inside the given conversation container.
 * Works for both regular LinkedIn and Sales Navigator.
 */
const findFormInConversation = (conversation: Element): Element | null => {
  // Regular LinkedIn: form.msg-form
  const form = conversation.querySelector('form.msg-form');
  if (form) return form;

  const msgForm = conversation.querySelector('.msg-form');
  if (msgForm) return msgForm;

  // Sales Navigator: form with textarea (hashed class names, so use structural selector)
  const snForm = conversation.querySelector('form');
  if (snForm) return snForm;

  return null;
};

const injectUI = () => {
  if (isInjecting) return;

  const conversation = getActiveConversation();
  if (!conversation) return;

  // Already injected into THIS conversation?
  if (conversation.querySelector('#' + MOUNT_ID)) return;

  // Conversation changed? Remove old injection first
  if (currentConversationEl && currentConversationEl !== conversation) {
    removeUI();
  }

  const form = findFormInConversation(conversation);
  if (!form) {
    console.log('[Yena Messages] No form found in conversation');
    return;
  }

  isInjecting = true;
  console.log('[Yena Messages] Injecting into conversation:', conversation.className.substring(0, 80));

  try {
    // Create container
    injectionContainer = document.createElement('div');
    injectionContainer.id = MOUNT_ID;
    injectionContainer.style.padding = '8px 12px';
    injectionContainer.style.display = 'flex';
    injectionContainer.style.justifyContent = 'center';

    // Insert before the form (above compose box)
    form.parentElement?.insertBefore(injectionContainer, form);

    if (!injectionContainer.parentElement) {
      console.error('[Yena Messages] Container was not inserted into DOM');
      isInjecting = false;
      return;
    }

    currentConversationEl = conversation;

    // Create shadow DOM for style isolation
    const shadowRoot = injectionContainer.attachShadow({ mode: 'open' });
    const mountPoint = document.createElement('div');
    shadowRoot.appendChild(mountPoint);

    root = createRoot(mountPoint);
    root.render(
      <React.StrictMode>
        <MessageSyncButton />
      </React.StrictMode>
    );

    // Reset flag after successful injection
    isInjecting = false;
    console.log('[Yena Messages] Sync button injected successfully.');
  } catch (error) {
    console.error('[Yena Messages] Injection error:', error);
    isInjecting = false;
  }
};

const removeUI = () => {
  if (root) {
    root.unmount();
    root = null;
  }
  if (injectionContainer) {
    injectionContainer.remove();
    injectionContainer = null;
  }
  currentConversationEl = null;
  isInjecting = false;
};

// --- URL Change Detection (SPA navigation) ---
let lastUrl = window.location.href;

const checkForNavigation = () => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('[Yena Messages] URL changed:', lastUrl, '->', currentUrl);
    lastUrl = currentUrl;
    removeUI();
    setTimeout(injectUI, 1000);
    setTimeout(injectUI, 3000);
  }
};

// MutationObserver for SPA navigation + overlay open/close detection
let mutationDebounce: ReturnType<typeof setTimeout> | null = null;

const observer = new MutationObserver(() => {
  checkForNavigation();

  // Check if we need to inject (new overlay opened, or mount was removed)
  const conversation = getActiveConversation();
  if (!conversation) {
    // No active conversation — clean up if we were injected
    if (currentConversationEl) removeUI();
    return;
  }

  // Conversation exists but we're not injected into it
  if (!conversation.querySelector('#' + MOUNT_ID) && !isInjecting) {
    if (mutationDebounce) clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(injectUI, 300);
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

// Initial injection with retries
console.log('[Yena Messages] Scheduling injection attempts...');
setTimeout(injectUI, 500);
setTimeout(injectUI, 1500);
setTimeout(injectUI, 3000);
setTimeout(injectUI, 5000);
