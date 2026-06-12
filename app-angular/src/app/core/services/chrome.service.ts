import { Injectable, NgZone } from '@angular/core';
import { isExtensionContextValid } from '../utils/chrome';

/**
 * Thin promise-based wrapper around the chrome.* APIs the app needs.
 * All calls are guarded (return safe defaults when the extension context is
 * unavailable) and re-enter Angular's zone so results trigger change detection.
 *
 * NOTE: when the Angular build runs hosted + injected into a page (no chrome.*
 * in page context), `available` is false. A postMessage bridge to the static
 * content script can be added here later without changing call sites.
 */
@Injectable({ providedIn: 'root' })
export class ChromeService {
  constructor(private readonly zone: NgZone) {}

  get available(): boolean {
    return isExtensionContextValid();
  }

  storageGet<T = unknown>(keys: string | string[]): Promise<Record<string, T>> {
    return new Promise((resolve) => {
      if (!this.available) {
        resolve({});
        return;
      }
      try {
        chrome.storage.local.get(keys, (res) => this.zone.run(() => resolve(res as Record<string, T>)));
      } catch {
        resolve({});
      }
    });
  }

  storageSet(items: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      if (!this.available) {
        resolve();
        return;
      }
      try {
        chrome.storage.local.set(items, () => this.zone.run(() => resolve()));
      } catch {
        resolve();
      }
    });
  }

  storageRemove(keys: string | string[]): Promise<void> {
    return new Promise((resolve) => {
      if (!this.available) {
        resolve();
        return;
      }
      try {
        chrome.storage.local.remove(keys, () => this.zone.run(() => resolve()));
      } catch {
        resolve();
      }
    });
  }

  sendMessage<T = unknown>(message: unknown): Promise<T | null> {
    return new Promise((resolve) => {
      if (!this.available) {
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response: T) => {
          this.zone.run(() => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(response ?? null);
          });
        });
      } catch {
        resolve(null);
      }
    });
  }
}
