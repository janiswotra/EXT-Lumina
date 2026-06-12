import { Component, NgZone, OnInit } from '@angular/core';
import { ApiResponse, SyncMessagesPayload } from '../../core/types';
import { ChromeService } from '../../core/services/chrome.service';
import { assetUrl } from '../../core/utils/assets';
import {
  autoScrollForFullHistory,
  getActiveConversation,
  getParticipantInfo,
  messageScrapeContainerSelector,
  scrapeMessages,
} from '../../core/utils/messages';

type SyncState = 'idle' | 'scrolling' | 'syncing' | 'done' | 'error';

const LABELS: Record<SyncState, string> = {
  idle: 'Sync to Yena',
  scrolling: 'Loading messages...',
  syncing: 'Syncing...',
  done: 'Synced',
  error: 'Retry Sync',
};

@Component({
  selector: 'app-message-sync-button',
  standalone: true,
  template: `
    <button (click)="handleSync()" [disabled]="isDisabled" [class]="buttonClass">
      @if (showSpinner) {
        <span class="inline-block w-3 h-3 border-[1.5px] border-black/15 border-t-[#666] rounded-full animate-spin"></span>
      } @else if (isDone) {
        <span class="text-[11px]">✓</span>
      } @else {
        <img [src]="iconUrl" alt="" class="w-3 h-3 opacity-70" />
      }
      {{ label }}
    </button>

    @if (toast) {
      <div [class]="toastClass">
        <span class="mr-2.5 text-base">{{ toast.type === 'success' ? '✓' : '⚠' }}</span>
        <span class="flex-1">{{ toast.msg }}</span>
        <button (click)="toast = null" class="ml-3 bg-transparent border-none text-inherit cursor-pointer text-sm opacity-70">✕</button>
      </div>
    }
  `,
})
export class MessageSyncButton implements OnInit {
  readonly iconUrl = assetUrl('icons/icon-16.png');

  syncState: SyncState = 'idle';
  toast: { msg: string; type: 'success' | 'error' } | null = null;
  authStatus: 'checking' | 'ok' | 'missing' = 'checking';

  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly chrome: ChromeService,
    private readonly zone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.chrome.sendMessage<any>({ type: 'CHECK_AUTH' }).then((res) => {
      this.authStatus = res?.success ? 'ok' : 'missing';
    });
  }

  get label(): string {
    return LABELS[this.syncState];
  }
  get isDone(): boolean {
    return this.syncState === 'done';
  }
  get showSpinner(): boolean {
    return this.syncState === 'scrolling' || this.syncState === 'syncing';
  }
  get isDisabled(): boolean {
    return this.showSpinner || this.isDone;
  }

  get buttonClass(): string {
    const base = 'flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-medium transition-all border leading-snug';
    const state = this.isDone
      ? 'bg-[#059669]/10 text-[#059669] border-[#059669]'
      : 'bg-transparent text-[#666] border-[#ccc] hover:bg-black/5';
    const disabled = this.isDisabled && !this.isDone ? 'opacity-50 cursor-default' : 'cursor-pointer';
    return `${base} ${state} ${disabled}`;
  }

  get toastClass(): string {
    const base =
      'fixed bottom-5 right-5 z-[2147483647] flex items-center px-4 py-3 rounded-lg shadow-lg border max-w-[400px] text-[13px] font-medium pointer-events-auto';
    return `${base} ${
      this.toast?.type === 'success'
        ? 'bg-[#064E3B] text-[#D1FAE5] border-[#047857]'
        : 'bg-[#7F1D1D] text-[#FEE2E2] border-[#B91C1C]'
    }`;
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast = { msg, type };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.zone.run(() => (this.toast = null)), 5000);
  }

  async handleSync(): Promise<void> {
    if (this.syncState === 'syncing' || this.syncState === 'scrolling') return;
    if (this.authStatus === 'missing') {
      this.showToast('Please set your API key in the Yena extension first.', 'error');
      return;
    }

    try {
      const conversation = getActiveConversation();
      if (!conversation) {
        this.showToast('No active conversation found.', 'error');
        this.syncState = 'idle';
        return;
      }

      this.syncState = 'scrolling';
      const container = conversation.querySelector(messageScrapeContainerSelector);
      if (container) await autoScrollForFullHistory(container);

      this.syncState = 'syncing';
      const messages = scrapeMessages(conversation);
      if (messages.length === 0) {
        this.showToast('No messages found in this conversation.', 'error');
        this.syncState = 'idle';
        return;
      }

      const participant = getParticipantInfo(conversation);
      if (!participant.url) {
        this.showToast('Could not find participant profile URL.', 'error');
        this.syncState = 'idle';
        return;
      }

      const payload: SyncMessagesPayload = {
        messages,
        conversationId: window.location.pathname,
        participantUrl: participant.url,
        participantName: participant.name,
      };

      const response = (await this.chrome.sendMessage<ApiResponse>({ type: 'SYNC_MESSAGES', payload })) as ApiResponse | null;
      if (!response) {
        this.showToast('Failed to communicate with extension. Please refresh.', 'error');
        this.syncState = 'error';
        return;
      }
      if (response.shouldAuth) {
        this.showToast('Please set your API key in the Yena extension.', 'error');
        this.syncState = 'error';
        return;
      }
      if (!response.success) {
        this.showToast(response.message || 'Sync failed.', 'error');
        this.syncState = 'error';
        return;
      }

      const data: any = response.data;
      if (data?.candidateNotFound) {
        this.showToast('No matching candidate found. Save them first with the Yena button.', 'error');
        this.syncState = 'idle';
        return;
      }

      const syncedCount = data?.synced ?? messages.length;
      const skippedCount = data?.skipped ?? 0;
      const candidateName = data?.candidateName || participant.name;
      let successMsg = `${syncedCount} message${syncedCount !== 1 ? 's' : ''} synced`;
      if (candidateName) successMsg += ` to ${candidateName}`;
      if (skippedCount > 0) successMsg += ` (${skippedCount} already existed)`;

      this.showToast(successMsg, 'success');
      this.syncState = 'done';
    } catch (err: any) {
      this.showToast(err?.message || 'An error occurred during sync.', 'error');
      this.syncState = 'error';
    }
  }
}
