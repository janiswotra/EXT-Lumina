import { environment } from '../../environments/environment';

// Environment configuration
export interface EnvConfig {
  id: 'demo' | 'prod';
  label: string;
  domain: string;
  apiBaseUrl: string;
  supabaseAnonKey: string;
}

export const ENVIRONMENTS: EnvConfig[] = environment.environments as EnvConfig[];

/** Find environment config by matching origin against known domains */
export function getEnvByDomain(origin: string): EnvConfig | undefined {
  return ENVIRONMENTS.find((env) => env.domain === origin);
}

/** Get environment config by id */
export function getEnvById(id: string): EnvConfig | undefined {
  return ENVIRONMENTS.find((env) => env.id === id);
}

/** All known app domains (for origin validation) */
export const ALL_APP_DOMAINS = ENVIRONMENTS.map((env) => env.domain);

// Storage key for active environment
export const ACTIVE_ENV_KEY = 'yena_active_env';

// Per-environment storage keys
export const STORAGE_KEYS = {
  apiKey: (envId: string) => `yena_api_key_${envId}`,
  userId: (envId: string) => `yena_user_id_${envId}`,
  cacheJobs: (envId: string) => `yena_cache_jobs_${envId}`,
  cacheStages: (envId: string) => `yena_cache_stages_${envId}`,
  cacheLists: (envId: string) => `yena_cache_lists_${envId}`,
} as const;

// Legacy storage keys for migration
export const LEGACY_STORAGE_KEYS = {
  API_KEY: 'lumina_api_key',
  USER_ID: 'lumina_user_id',
  CACHE_JOBS: 'lumina_cache_jobs',
  CACHE_STAGES: 'lumina_cache_stages',
  CACHE_LISTS: 'lumina_cache_lists',
} as const;

// Old single-env storage keys (for migration to per-env)
export const OLD_STORAGE_KEYS = {
  API_KEY: 'yena_api_key',
  USER_ID: 'yena_user_id',
  CACHE_JOBS: 'yena_cache_jobs',
  CACHE_STAGES: 'yena_cache_stages',
  CACHE_LISTS: 'yena_cache_lists',
} as const;

// DOM element IDs
export const DOM_IDS = {
  EXTENSION_MOUNT: 'yena-extension-mount',
  EXTENSION_INSTALLED: 'yena-extension-installed',
  LEGACY_EXTENSION_INSTALLED: 'lumina-extension-installed',
  MESSAGES_MOUNT: 'yena-messages-mount',
  ROOT: 'yena-root',
} as const;
