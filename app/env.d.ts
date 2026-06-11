/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL_DEMO: string;
  readonly VITE_SUPABASE_ANON_KEY_DEMO: string;
  readonly VITE_APP_DOMAIN_DEMO: string;
  readonly VITE_API_BASE_URL_PROD: string;
  readonly VITE_SUPABASE_ANON_KEY_PROD: string;
  readonly VITE_APP_DOMAIN_PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
