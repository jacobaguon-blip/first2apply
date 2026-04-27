export const ENV = {
  nodeEnv: process.env.NODE_ENV,
  appBundleId: process.env.APP_BUNDLE_ID,
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  mezmoApiKey: process.env.MEZMO_API_KEY,
  amplitudeApiKey: process.env.AMPLITUDE_API_KEY,
  pushover: {
    appToken: process.env.PUSHOVER_APP_TOKEN,
    userKey: process.env.PUSHOVER_USER_KEY,
  },
  pauseScans: /^(1|true|yes)$/i.test(process.env.F2A_PAUSE_SCANS ?? ''),
};
