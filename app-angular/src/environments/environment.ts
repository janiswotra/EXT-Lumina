// Angular environment config — replaces the Vite import.meta.env.VITE_* used by
// the React app. Fill apiBaseUrl / supabaseAnonKey from the original .env values.
export const environment = {
  production: false,
  environments: [
    { id: 'demo', label: 'Demo', domain: 'https://demo.yena.ai', apiBaseUrl: '', supabaseAnonKey: '' },
    { id: 'prod', label: 'Prod', domain: 'https://app.yena.ai', apiBaseUrl: '', supabaseAnonKey: '' },
  ],
};
