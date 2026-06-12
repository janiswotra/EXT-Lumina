import { Component, EventEmitter, Input, NgZone, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '../button/button';
import { InputComponent } from '../ui/input';
import { ACTIVE_ENV_KEY, ENVIRONMENTS, STORAGE_KEYS } from '../../core/constants';
import { isExtensionContextValid } from '../../core/utils/chrome';
import { assetUrl } from '../../core/utils/assets';

@Component({
  selector: 'app-auth-screen',
  standalone: true,
  imports: [FormsModule, Button, InputComponent],
  templateUrl: './auth-screen.html',
})
export class AuthScreen {
  @Input() isChecking = false;
  @Output() success = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  readonly logoUrl = assetUrl('icons/icon-32.png');
  apiKey = '';
  isConnecting = false;
  authError = '';

  constructor(private readonly zone: NgZone) {}

  handleConnect(): void {
    const key = this.apiKey.trim();
    if (!key) return;
    if (!isExtensionContextValid()) {
      this.authError = 'Extension context unavailable.';
      return;
    }
    this.isConnecting = true;
    this.authError = '';

    chrome.storage.local.get(ACTIVE_ENV_KEY, (envResult: Record<string, unknown>) => {
      const envId = (envResult[ACTIVE_ENV_KEY] as string) || ENVIRONMENTS[0].id;
      const storageKey = STORAGE_KEYS.apiKey(envId);
      chrome.storage.local.set({ [storageKey]: key }, () => {
        chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response: any) => {
          this.zone.run(() => {
            this.isConnecting = false;
            if (response && response.success) {
              this.success.emit();
            } else {
              this.authError = response?.message || 'Failed to connect. Please check your key.';
            }
          });
        });
      });
    });
  }
}
