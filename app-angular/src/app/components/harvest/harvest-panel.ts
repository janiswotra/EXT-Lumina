import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChromeService } from '../../core/services/chrome.service';
import { formatTimeAgo } from '../../core/utils/time';

interface HarvestStatus {
  unsyncedCount: number;
  lastSyncedAt: string | null;
}

interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

@Component({
  selector: 'app-harvest-panel',
  standalone: true,
  template: `
    <div class="bg-gradient-to-br from-[#fffbeb] to-[#fff7ed] rounded-xl p-4 border border-[#fde68a]">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xl">🌾</span>
        <h3 class="font-semibold text-[#92400e] text-base">Harvested Profiles</h3>
      </div>

      <div class="mb-4">
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-bold text-[#d97706]">{{ status.unsyncedCount }}</span>
          <span class="text-base text-[#92400e]">
            profile{{ status.unsyncedCount !== 1 ? 's' : '' }} ready to sync
          </span>
        </div>
      </div>

      <button (click)="handleSync()" [disabled]="isSyncing || status.unsyncedCount === 0" [class]="syncButtonClass">
        @if (isSyncing) {
          <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Syncing...
        } @else {
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync to Yena
        }
      </button>

      <p class="text-sm text-[#b45309]/70 mt-3 text-center">Last synced: {{ lastSyncedLabel }}</p>

      @if (syncResult) {
        <div class="mt-3 p-2 bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg text-sm text-[#065f46]">
          <div class="font-medium mb-1">✓ Sync Complete</div>
          <div>Imported: {{ syncResult.imported }} | Updated: {{ syncResult.updated }} | Skipped: {{ syncResult.skipped }}</div>
          @if (syncResult.errors.length > 0) {
            <div class="text-[#dc2626] mt-1">Errors: {{ syncResult.errors.length }}</div>
          }
        </div>
      }

      @if (error) {
        <div class="mt-3 p-2 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-sm text-[#991b1b]">{{ error }}</div>
      }

      <p class="text-sm text-[#b45309]/60 mt-3 text-center italic">
        Profiles are automatically captured when you browse LinkedIn or Sales Navigator
      </p>
    </div>
  `,
})
export class HarvestPanel implements OnInit, OnDestroy {
  status: HarvestStatus = { unsyncedCount: 0, lastSyncedAt: null };
  isSyncing = false;
  syncResult: SyncResult | null = null;
  error: string | null = null;

  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly chrome: ChromeService) {}

  ngOnInit(): void {
    void this.fetchStatus();
    this.timer = setInterval(() => void this.fetchStatus(), 10000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get lastSyncedLabel(): string {
    return formatTimeAgo(this.status.lastSyncedAt);
  }

  get syncButtonClass(): string {
    const base =
      'w-full py-2.5 px-4 rounded-lg font-medium text-base transition-all duration-200 flex items-center justify-center gap-2';
    return `${base} ${
      this.status.unsyncedCount > 0 && !this.isSyncing
        ? 'bg-[#d97706] hover:bg-[#b45309] text-white shadow-md hover:shadow-lg'
        : 'bg-[#e8ebf1] text-[#7e8799] cursor-not-allowed'
    }`;
  }

  async fetchStatus(): Promise<void> {
    const response = await this.chrome.sendMessage<any>({ type: 'GET_HARVEST_STATUS' });
    if (response?.success) {
      this.status = {
        unsyncedCount: response.data?.unsyncedCount || 0,
        lastSyncedAt: response.data?.lastSyncedAt || null,
      };
    }
  }

  async handleSync(): Promise<void> {
    this.isSyncing = true;
    this.error = null;
    this.syncResult = null;
    try {
      const response = await this.chrome.sendMessage<any>({ type: 'SYNC_HARVEST' });
      if (response?.success) {
        this.syncResult = response.data;
        await this.fetchStatus();
      } else {
        this.error = response?.message || 'Sync failed';
      }
    } finally {
      this.isSyncing = false;
    }
  }
}
