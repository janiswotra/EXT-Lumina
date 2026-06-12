import { Component, OnDestroy, OnInit } from '@angular/core';
import { Sidebar } from '../sidebar/sidebar';
import { Preview } from '../preview/preview';
import { Toast } from '../toast/toast';
import { AuthScreen } from '../auth-screen/auth-screen';
import { ApiResponse } from '../../core/types';
import { ChromeService } from '../../core/services/chrome.service';
import { isExtensionContextValid } from '../../core/utils/chrome';
import { parseProfile, parseProfileWithRetry, waitForProfileToLoad } from '../../core/utils/parsers';
import { extractLinkedInMemberId, isProfileUrl, normalizeLinkedInUrl } from '../../core/utils/linkedin';
import { hasMeaningfulProfileSignals } from '../../core/utils/validation';
import { ENVIRONMENTS, STORAGE_KEYS } from '../../core/constants';
import { assetUrl } from '../../core/utils/assets';
import {
  canSaveProfileBasic,
  emptyProfile,
  mergeProfileReliably,
  sanitizeProfileTopFields,
} from '../../core/utils/profile';

type ViewMode = 'hidden' | 'preview' | 'full';
type AuthState = 'CHECKING' | 'AUTHENTICATED' | 'MISSING_KEY';

@Component({
  selector: 'app-linkedin-injector',
  standalone: true,
  imports: [Sidebar, Preview, Toast, AuthScreen],
  templateUrl: './linkedin-injector.html',
})
export class LinkedInInjector implements OnInit, OnDestroy {
  readonly logoUrl = assetUrl('icons/icon-32.png');

  viewMode: ViewMode = 'hidden';
  loading = false;
  toast: { msg: string; type: 'success' | 'error' } | null = null;
  isFetchingData = false;
  authStatus: AuthState = 'CHECKING';
  isExisting = false;
  profileData: any = emptyProfile(window.location.href);

  private currentUrl = window.location.href;
  private pendingStatusCheckUrl: string | null = null;
  private destroyed = false;
  private hasInitiallyLoaded = false;
  private usedAIParsing = false;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly chrome: ChromeService) {}

  ngOnInit(): void {
    void this.checkAuth();
    void this.loadProfileData();
    this.pollTimer = setInterval(() => this.pollForChanges(), 3000);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  // --- Auth ---
  async checkAuth(): Promise<void> {
    if (!isExtensionContextValid()) {
      this.authStatus = 'MISSING_KEY';
      return;
    }
    const timeout = setTimeout(() => (this.authStatus = 'MISSING_KEY'), 5000);
    const response = await this.chrome.sendMessage<any>({ type: 'CHECK_AUTH' });
    clearTimeout(timeout);
    this.authStatus = response && response.success ? 'AUTHENTICATED' : 'MISSING_KEY';
  }

  // --- Page detection ---
  isValidProfilePage(): boolean {
    const url = window.location.href;
    return (
      url.includes('/in/') ||
      url.includes('/sales/lead/') ||
      url.includes('/sales/people/') ||
      url.includes('/talent/profile/')
    );
  }

  private resetProfileState(): void {
    this.isExisting = false;
    this.isFetchingData = false;
    this.pendingStatusCheckUrl = null;
    this.profileData = emptyProfile(window.location.href);
  }

  // --- Profile loading ---
  async loadProfileData(): Promise<void> {
    if (!isExtensionContextValid() || !this.isValidProfilePage()) return;

    const urlAtStart = window.location.href;
    this.isFetchingData = true;
    try {
      const isReady = await waitForProfileToLoad(5000);
      if (this.destroyed || window.location.href !== urlAtStart) return;

      const data: any = isReady
        ? await parseProfileWithRetry(3, 250, false)
        : await parseProfileWithRetry(1, 100, false);
      if (this.destroyed || window.location.href !== urlAtStart) return;

      if (data._parseMethod === 'ai') this.usedAIParsing = true;

      const prefetchData = sanitizeProfileTopFields(data);
      const prev = this.profileData;
      this.profileData = {
        ...mergeProfileReliably(prev, prefetchData, 'prefetch'),
        email: prefetchData.email || (prev.linkedinUrl === window.location.href ? prev.email : '') || '',
        phone: prefetchData.phone || (prev.linkedinUrl === window.location.href ? prev.phone : '') || '',
        linkedinUrl: window.location.href,
        _parseMethod: data._parseMethod || prev._parseMethod,
      };

      if (data.firstName && data.lastName && data.firstName !== 'Unknown') {
        void this.checkCandidateStatus(data);
      }

      this.hasInitiallyLoaded = true;
    } catch {
      /* silent */
    } finally {
      if (!this.destroyed) this.isFetchingData = false;
    }
  }

  private async checkCandidateStatus(data: any): Promise<void> {
    const currentUrl = window.location.href;
    const normalizedUrl = normalizeLinkedInUrl(currentUrl);
    const memberId = extractLinkedInMemberId(currentUrl);
    const sourceUrls = Array.from(
      new Set(
        [currentUrl, normalizedUrl, memberId ? `https://www.linkedin.com/in/${memberId}` : '']
          .filter(Boolean)
          .map((item) => normalizeLinkedInUrl(item)),
      ),
    );
    this.pendingStatusCheckUrl = normalizedUrl;

    const res = (await this.chrome.sendMessage<ApiResponse>({
      type: 'CHECK_CANDIDATE_STATUS',
      payload: {
        sourceUrl: currentUrl,
        sourceUrls,
        memberIds: memberId ? [memberId] : [],
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        currentCompany: data.currentCompany || '',
      },
    })) as any;

    const currentNormalizedUrl = normalizeLinkedInUrl(window.location.href);
    const isForCurrent = this.pendingStatusCheckUrl === normalizedUrl && currentNormalizedUrl === normalizedUrl;
    if (!this.destroyed && isForCurrent && res && res.success && res.data) {
      this.isExisting = !!res.data.exists;
    }
  }

  private hasDataChanged(newData: any, prevData: any): boolean {
    const coreFields = ['firstName', 'lastName', 'headline', 'location', 'currentCompany'];
    for (const field of coreFields) {
      if (newData[field] && newData[field] !== prevData[field]) return true;
    }
    if (newData.experiences?.length !== prevData.experiences?.length) return true;
    if (newData.educations?.length !== prevData.educations?.length) return true;
    if (newData.skills?.length !== prevData.skills?.length) return true;
    return false;
  }

  private pollForChanges(): void {
    if (this.destroyed) return;
    if (!isExtensionContextValid()) {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }
      return;
    }

    if (window.location.href !== this.currentUrl) {
      this.currentUrl = window.location.href;
      this.hasInitiallyLoaded = false;
      this.usedAIParsing = false;
      this.resetProfileState();
      this.viewMode = 'hidden';
      void this.loadProfileData();
      return;
    }

    if (this.viewMode === 'full' && this.hasInitiallyLoaded && !this.usedAIParsing) {
      try {
        const data: any = parseProfile();
        if (this.hasDataChanged(data, this.profileData)) {
          const prev = this.profileData;
          this.profileData = {
            ...mergeProfileReliably(prev, data, 'prefetch'),
            email: prev.email || data.email || '',
            phone: prev.phone || data.phone || '',
            linkedinUrl: window.location.href,
          };
        }
      } catch {
        /* expected */
      }
    }
  }

  // --- Deep hydration when sidebar opens ---
  private async hydrateDeep(): Promise<void> {
    if (this.profileData._parseMethod === 'ai') return;
    const urlAtStart = window.location.href;
    try {
      const isReady = await waitForProfileToLoad(6000);
      if (this.destroyed || window.location.href !== urlAtStart) return;
      const deepData: any = isReady
        ? await parseProfileWithRetry(4, 300, false)
        : await parseProfileWithRetry(2, 150, false);
      if (this.destroyed || window.location.href !== urlAtStart) return;
      const prev = this.profileData;
      this.profileData = {
        ...mergeProfileReliably(prev, deepData, 'deep'),
        email: prev.email || deepData.email || '',
        phone: prev.phone || deepData.phone || '',
        linkedinUrl: window.location.href,
      };
    } catch {
      /* best-effort */
    }
  }

  private enterFullMode(): void {
    this.viewMode = 'full';
    void this.hydrateDeep();
  }

  // --- User actions ---
  handleAddCandidate(): void {
    this.loading = true;
    setTimeout(() => {
      this.enterFullMode();
      this.loading = false;
    }, 500);
  }

  toggleView(): void {
    if (this.viewMode === 'hidden') {
      if (!this.isValidProfilePage()) {
        this.toast = { msg: 'Visit a Candidate Profile to get started', type: 'error' };
        return;
      }
      if (this.isExisting) this.enterFullMode();
      else this.viewMode = 'preview';
    } else {
      this.viewMode = 'hidden';
    }
  }

  onAuthSuccess(): void {
    this.authStatus = 'AUTHENTICATED';
  }

  // Arrow fields preserve `this` when passed to <app-sidebar> inputs.
  setProfileData = (data: any): void => {
    this.profileData = data;
  };

  handleDisconnect = (): void => {
    const keysToRemove = ENVIRONMENTS.map((e) => STORAGE_KEYS.apiKey(e.id));
    void this.chrome.storageRemove(keysToRemove).then(() => {
      this.authStatus = 'MISSING_KEY';
    });
  };

  handleSave = async (jobId?: string, stageId?: string, listId?: string): Promise<boolean> => {
    this.loading = true;
    this.toast = null;
    try {
      const validation = canSaveProfileBasic(this.profileData, isProfileUrl, hasMeaningfulProfileSignals);
      if (!validation.ok) throw new Error(validation.reason || 'Profile validation failed.');

      const payload = {
        profile: this.profileData,
        ...(jobId && { jobId }),
        ...(stageId && { stageId }),
        ...(listId && { listId }),
      };

      const response = await this.chrome.sendMessage<any>({ type: 'SAVE_CANDIDATE', payload });
      if (!response) throw new Error('Failed to communicate with extension. Please refresh the page.');

      if (response.success) {
        this.toast = { msg: 'Candidate saved to Yena!', type: 'success' };
        setTimeout(() => (this.viewMode = 'hidden'), 1500);
        return true;
      }
      this.toast = { msg: response?.message || 'Failed to save.', type: 'error' };
      return false;
    } catch (e: any) {
      this.toast = { msg: e?.message || 'Error occurred.', type: 'error' };
      return false;
    } finally {
      this.loading = false;
    }
  };
}
