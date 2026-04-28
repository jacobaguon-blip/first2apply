/**
 * Env-var validation for serverProbe. Runs BEFORE app.whenReady() so the
 * process exits early if any required secret is missing.
 */

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PUSHOVER_APP_TOKEN',
  'PUSHOVER_USER_KEY',
  'OPENAI_API_KEY',
  'APPROVAL_HMAC_SECRET',
] as const;

export type ServerProbeEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  pushoverAppToken: string;
  pushoverUserKey: string;
  openaiApiKey: string;
  approvalHmacSecret: string;
  cronRule: string;
  logFile: boolean;
  tz?: string;
};

export function validateEnv(opts: { skip?: boolean } = {}): ServerProbeEnv | undefined {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    if (opts.skip) {
      console.warn(`[serverProbe] env vars missing (skip=true): ${missing.join(', ')}`);
      return undefined;
    }
    console.error(
      `[serverProbe] FATAL: missing required env vars: ${missing.join(', ')}\n` +
        `Set them in /opt/first2apply/.env (chmod 600) before starting the service.`,
    );
    process.exit(1);
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    pushoverAppToken: process.env.PUSHOVER_APP_TOKEN!,
    pushoverUserKey: process.env.PUSHOVER_USER_KEY!,
    openaiApiKey: process.env.OPENAI_API_KEY!,
    approvalHmacSecret: process.env.APPROVAL_HMAC_SECRET!,
    cronRule: process.env.F2A_CRON_RULE ?? '0 * * * *',
    logFile: process.env.F2A_LOG_FILE === '1',
    tz: process.env.TZ,
  };
}
