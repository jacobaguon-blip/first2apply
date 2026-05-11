import { First2ApplyBackendEnv, parseEnv } from './env.ts';

import { DbSchema, User } from '@first2apply/core';
import { createClient } from '@supabase/supabasefork';

import { ILogger } from './logger.ts';

// Function overloads for type safety based on checkAuthorization
export type EdgeFunctionAnonymousContext = {
  logger: ILogger;
  user: null; // always null when checkAuthorization is false
  supabaseClient: ReturnType<typeof createClient<DbSchema>>;
  supabaseAdminClient: ReturnType<typeof createClient<DbSchema>>;
  env: First2ApplyBackendEnv;
};
export type EdgeFunctionAuthorizedContext = Omit<EdgeFunctionAnonymousContext, 'user'> & {
  // May be null when the caller used a service-role JWT (probe / cron / Pi
  // control-server). In that case the function is responsible for deriving
  // the effective user from request payload (e.g. links[i].user_id).
  user: User | null;
};

/**
 * Infrastructure function to get the context for an edge function,
 * including logger, supabase clients, and user info if authorized.
 */
export async function getEdgeFunctionContext({
  logger,
  req,
  checkAuthorization,
}: {
  logger: ILogger;
  req: Request;
  checkAuthorization: false;
}): Promise<EdgeFunctionAnonymousContext>;
export async function getEdgeFunctionContext({
  logger,
  req,
  checkAuthorization,
}: {
  logger: ILogger;
  req: Request;
  checkAuthorization: true;
}): Promise<EdgeFunctionAuthorizedContext>;

// actual implementation
export async function getEdgeFunctionContext({
  logger,
  req,
  checkAuthorization,
}: {
  logger: ILogger;
  req: Request;
  checkAuthorization: boolean;
}) {
  const env = parseEnv();
  const requestId = crypto.randomUUID();
  logger.addMeta('request_id', requestId);

  const supabaseAdminClient = createClient<DbSchema>(env.supabaseUrl, env.supabaseServiceRoleKey);
  let supabaseClient = supabaseAdminClient;
  let user: User | null = null;
  if (checkAuthorization) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    supabaseClient = createClient<DbSchema>(env.supabaseUrl, env.supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Detect service-role JWT (probe / cron / control-server callers). The
    // service-role token has `role: service_role` and no `sub` claim, so
    // auth.getUser() returns "invalid claim: missing sub claim". In that case
    // we leave `user` null and require the caller to derive the effective
    // user from request payload (e.g. links[i].user_id in scan-urls).
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const isServiceRole = decodeJwtRole(bearerToken) === 'service_role';

    if (!isServiceRole) {
      const { data: userData, error: getUserError } = await supabaseClient.auth.getUser();
      if (getUserError) {
        throw new Error(getUserError.message);
      }

      user = {
        id: userData?.user?.id ?? '',
        email: userData?.user?.email ?? '',
      };
      logger.addMeta('user_id', user?.id ?? '');
      logger.addMeta('user_email', user?.email ?? '');
    } else {
      logger.addMeta('caller', 'service_role');
    }
  }

  return {
    logger,
    user,
    supabaseClient,
    supabaseAdminClient,
    env,
  };
}

/**
 * Decode the `role` claim from a Supabase JWT without verifying the
 * signature. Safe here because Supabase's gateway has already validated the
 * token via `verify_jwt = true` before our function ran. Returns null on any
 * decode failure so callers fall back to the user-token path.
 */
function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as { role?: string };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}
