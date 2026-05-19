import { useEffect, useState } from 'react';

import { getCareerOpsFlag } from '../lib/electronMainSdk';

const FORCE = String(process.env.F2A_FORCE_CAREER_OPS ?? '') === '1';

/**
 * Returns whether the Career Ops Tier 1 UI should be visible to the current
 * user. True when either:
 *   - the user's profile has `career_ops_enabled = true`, OR
 *   - the build was compiled with F2A_FORCE_CAREER_OPS=1 (local dev override).
 *
 * Spec calls this VITE_FORCE_CAREER_OPS; this app uses webpack's
 * EnvironmentPlugin so the equivalent build-time var is F2A_FORCE_CAREER_OPS.
 */
export function useCareerOps(): {
  enabled: boolean;
  dbEnabled: boolean;
  loading: boolean;
  refresh: () => void;
} {
  const [dbEnabled, setDbEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCareerOpsFlag()
      .then((r) => {
        if (!cancelled) setDbEnabled(!!r.enabled);
      })
      .catch(() => {
        if (!cancelled) setDbEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    enabled: dbEnabled || FORCE,
    dbEnabled,
    loading,
    refresh: () => setTick((t) => t + 1),
  };
}
