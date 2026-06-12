import { Injectable } from '@angular/core';
import { ChromeService } from './chrome.service';
import { ACTIVE_ENV_KEY, ENVIRONMENTS, getEnvById, STORAGE_KEYS } from '../constants';
import { Job, List, Stage } from '../types';

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

interface FetchOpts {
  messageType: string;
  payload?: unknown;
  cacheKey?: string;
  dataKey?: string;
  forceRefresh?: boolean;
}

/**
 * Extension metadata API (jobs / stages / lists / auth) over ChromeService,
 * with the same caching + response-normalization the React Sidebar did.
 */
@Injectable({ providedIn: 'root' })
export class ExtensionApiService {
  constructor(private readonly chrome: ChromeService) {}

  async getActiveEnv(): Promise<{ id: string; label: string }> {
    const res = await this.chrome.storageGet<string>(ACTIVE_ENV_KEY);
    const envId = res[ACTIVE_ENV_KEY] || ENVIRONMENTS[0].id;
    const env = getEnvById(envId) || ENVIRONMENTS[0];
    return { id: env.id, label: env.label };
  }

  private async getCached<T>(key: string): Promise<T | null> {
    const res = await this.chrome.storageGet<{ data: T; timestamp: number }>(key);
    const item = res[key];
    if (item && Date.now() - item.timestamp < CACHE_DURATION) return item.data;
    return null;
  }

  private setCached<T>(key: string, data: T): void {
    void this.chrome.storageSet({ [key]: { data, timestamp: Date.now() } });
  }

  async fetchCached<T>(opts: FetchOpts): Promise<T[]> {
    const { messageType, payload, cacheKey, dataKey, forceRefresh = false } = opts;

    const extract = (rd: any): T[] => {
      if (Array.isArray(rd)) return rd;
      if (dataKey && Array.isArray(rd?.[dataKey])) return rd[dataKey];
      if (Array.isArray(rd?.data)) return rd.data;
      return [];
    };

    if (!forceRefresh && cacheKey) {
      const cached = await this.getCached<T[]>(cacheKey);
      if (cached) return cached;
    }

    const msg = payload ? { type: messageType, payload } : { type: messageType };
    const response = await this.chrome.sendMessage<any>(msg);
    if (response && response.success && response.data) {
      const items = extract(response.data);
      if (cacheKey && items.length > 0) this.setCached(cacheKey, items);
      return items;
    }
    return [];
  }

  getJobs(envId: string, forceRefresh = false): Promise<Job[]> {
    return this.fetchCached<Job>({
      messageType: 'GET_JOBS',
      cacheKey: STORAGE_KEYS.cacheJobs(envId),
      dataKey: 'jobs',
      forceRefresh,
    });
  }

  getStages(envId: string, jobId?: string, forceRefresh = false): Promise<Stage[]> {
    return this.fetchCached<Stage>({
      messageType: 'GET_STAGES',
      payload: jobId ? { jobId } : undefined,
      cacheKey: jobId ? undefined : STORAGE_KEYS.cacheStages(envId),
      dataKey: 'stages',
      forceRefresh: jobId ? true : forceRefresh,
    });
  }

  getLists(envId: string, forceRefresh = false): Promise<List[]> {
    return this.fetchCached<List>({
      messageType: 'GET_LISTS',
      cacheKey: STORAGE_KEYS.cacheLists(envId),
      dataKey: 'lists',
      forceRefresh,
    });
  }

  checkAuth(): Promise<{ success: boolean; message?: string } | null> {
    return this.chrome.sendMessage<{ success: boolean; message?: string }>({ type: 'CHECK_AUTH' });
  }
}
