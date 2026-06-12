import { Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output } from '@angular/core';
import { ChromeService } from '../../core/services/chrome.service';
import { formatTimeAgo } from '../../core/utils/time';

interface HarvestedProfilePreview {
  linkedinUrl: string;
  firstName: string;
  lastName: string;
  headline?: string;
  currentCompany?: string;
  capturedAt: string;
}

@Component({
  selector: 'app-harvest-queue-section',
  standalone: true,
  template: `
    @if (unsyncedCount > 0) {
      @if (variant === 'compact') {
        <button (click)="handleSync()" [disabled]="isSyncing" [class]="compactButtonClass">
          <div class="flex items-center gap-2">
            <span class="text-lg">🌾</span>
            <span class="text-base text-[#92400e]">{{ unsyncedCount }} harvested</span>
          </div>
          <div class="flex items-center gap-1.5 text-[#d97706] text-sm font-medium">
            @if (isSyncing) {
              <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Syncing...
            } @else if (syncResult) {
              <span class="text-[#059669]">✓ Synced</span>
            } @else {
              Sync
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            }
          </div>
        </button>
      } @else {
        <div class="border-t border-[#e8ebf1] pt-4 mt-4">
          <button (click)="isExpanded = !isExpanded" class="w-full flex items-center justify-between mb-3 group cursor-pointer">
            <div class="flex items-center gap-2">
              <span class="text-base">🌾</span>
              <h4 class="text-sm font-semibold text-[#d97706] uppercase tracking-wider group-hover:text-[#b45309] transition-colors">
                Harvested Queue
              </h4>
              <span class="text-sm bg-[#fffbeb] text-[#92400e] px-2 py-0.5 rounded-full border border-[#fde68a]">{{ unsyncedCount }}</span>
            </div>
            <svg [class]="chevronClass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          @if (isExpanded) {
            <div class="space-y-3">
              <div class="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                @for (profile of profiles; track profile.linkedinUrl) {
                  <div class="flex items-center gap-3 p-2 rounded-lg bg-[#fafbfc] hover:bg-[#f5f7fa] border border-[#e8ebf1] transition-colors">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[#fde68a] to-[#fed7aa] flex items-center justify-center shrink-0">
                      <span class="text-sm font-medium text-[#92400e]">{{ profile.firstName?.[0] }}{{ profile.lastName?.[0] }}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-base font-medium text-[#181c25] truncate">{{ profile.firstName }} {{ profile.lastName }}</p>
                      <p class="text-sm text-[#687182] truncate">
                        {{ profile.currentCompany || profile.headline || 'No details' }}
                        <span class="text-[#7e8799]"> • {{ formatTime(profile.capturedAt) }}</span>
                      </p>
                    </div>
                  </div>
                }
                @if (unsyncedCount > 10) {
                  <p class="text-sm text-[#687182] text-center py-1">+{{ unsyncedCount - 10 }} more profiles</p>
                }
              </div>

              <button (click)="handleSync()" [disabled]="isSyncing" [class]="fullButtonClass">
                @if (isSyncing) {
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Syncing to Yena...
                } @else {
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync All to Yena
                }
              </button>

              @if (syncResult) {
                <div class="p-2 bg-[#ecfdf5] border border-[#a7f3d0] rounded-lg text-sm text-[#065f46] text-center">
                  ✓ Synced: {{ syncResult.imported }} imported, {{ syncResult.updated }} updated
                </div>
              }
              @if (error) {
                <div class="p-2 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-sm text-[#991b1b] text-center">{{ error }}</div>
              }
              <p class="text-sm text-[#7e8799] text-center italic">
                Profiles captured while browsing LinkedIn or Sales Navigator
              </p>
            </div>
          }
        </div>
      }
    }
  `,
})
export class HarvestQueueSection implements OnInit, OnDestroy {
  @Input() variant: 'full' | 'compact' = 'full';
  @Output() syncComplete = new EventEmitter<void>();

  isExpanded = false;
  profiles: HarvestedProfilePreview[] = [];
  unsyncedCount = 0;
  isSyncing = false;
  syncResult: { imported: number; updated: number } | null = null;
  error: string | null = null;

  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly chrome: ChromeService,
    private readonly zone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.fetchQueue();
    this.timer = setInterval(() => void this.fetchQueue(), 30000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  formatTime(value: string): string {
    return formatTimeAgo(value);
  }

  get chevronClass(): string {
    return `w-4 h-4 text-[#687182] transition-transform duration-200 ${this.isExpanded ? 'rotate-180' : ''}`;
  }
  get compactButtonClass(): string {
    return `w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all bg-[#fffbeb] border border-[#fde68a] hover:border-[#fbbf24] ${
      this.isSyncing ? 'opacity-70 cursor-wait' : ''
    }`;
  }
  get fullButtonClass(): string {
    const base = 'w-full py-2.5 px-4 rounded-lg font-medium text-base transition-all duration-200 flex items-center justify-center gap-2';
    return `${base} ${
      this.isSyncing
        ? 'bg-[#e8ebf1] text-[#7e8799] cursor-wait'
        : 'bg-[#d97706] hover:bg-[#b45309] text-white shadow-md hover:shadow-lg'
    }`;
  }

  async fetchQueue(): Promise<void> {
    const response = await this.chrome.sendMessage<any>({ type: 'GET_HARVEST_QUEUE' });
    if (response?.success && response?.data) {
      const queue = response.data;
      const unsynced = (queue.profiles?.filter((p: any) => !p.synced) || []) as any[];
      this.unsyncedCount = unsynced.length;
      this.profiles = unsynced
        .slice(0, 10)
        .map((p: any) => ({
          linkedinUrl: p.linkedinUrl,
          firstName: p.scrapedData?.firstName || 'Unknown',
          lastName: p.scrapedData?.lastName || '',
          headline: p.scrapedData?.headline,
          currentCompany: p.scrapedData?.currentCompany,
          capturedAt: p.capturedAt,
        }))
        .reverse();
    }
  }

  async handleSync(): Promise<void> {
    this.isSyncing = true;
    this.error = null;
    this.syncResult = null;
    try {
      const response = await this.chrome.sendMessage<any>({ type: 'SYNC_HARVEST' });
      if (response?.success) {
        this.syncResult = {
          imported: response.data?.imported || 0,
          updated: response.data?.updated || 0,
        };
        await this.fetchQueue();
        this.syncComplete.emit();
        setTimeout(() => this.zone.run(() => (this.syncResult = null)), 3000);
      } else {
        this.error = response?.message || 'Sync failed';
      }
    } finally {
      this.isSyncing = false;
    }
  }
}
