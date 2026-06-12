import { isExtensionContextValid } from './chrome';

/**
 * Resolve an asset path. Uses chrome.runtime.getURL when running inside a valid
 * extension context; otherwise falls back to a path relative to the hosted app
 * base (the build is hosted under /api/v1/extension/<channel>/ and injected).
 *
 * The `invalid` guard avoids the `chrome-extension://invalid/` requests that the
 * old React content scripts spammed after the extension context was invalidated.
 */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\.?\//, '');
  if (isExtensionContextValid()) {
    try {
      const url = chrome.runtime.getURL(clean);
      if (url && !url.includes('invalid')) return url;
    } catch {
      /* fall through to relative */
    }
  }
  return `./${clean}`;
}
