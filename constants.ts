export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN as string;

// Centralized storage keys (yena_ prefix)
export const STORAGE_KEYS = {
  API_KEY: 'yena_api_key',
  USER_ID: 'yena_user_id',
  CACHE_JOBS: 'yena_cache_jobs',
  CACHE_STAGES: 'yena_cache_stages',
  CACHE_LISTS: 'yena_cache_lists',
} as const;

// Legacy storage keys for migration
export const LEGACY_STORAGE_KEYS = {
  API_KEY: 'lumina_api_key',
  USER_ID: 'lumina_user_id',
  CACHE_JOBS: 'lumina_cache_jobs',
  CACHE_STAGES: 'lumina_cache_stages',
  CACHE_LISTS: 'lumina_cache_lists',
} as const;

// DOM element IDs
export const DOM_IDS = {
  EXTENSION_MOUNT: 'yena-extension-mount',
  EXTENSION_INSTALLED: 'yena-extension-installed',
  LEGACY_EXTENSION_INSTALLED: 'lumina-extension-installed',
  MESSAGES_MOUNT: 'yena-messages-mount',
  ROOT: 'yena-root',
} as const;
