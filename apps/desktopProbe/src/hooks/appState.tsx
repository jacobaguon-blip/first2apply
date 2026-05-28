import React, { createContext, useContext, useEffect, useState } from 'react';

import { getAppState } from '@/lib/electronMainSdk';
import { NewAppVersion } from '@/lib/types';

import { useError } from './error';

// Create a context for the app state
const AppStateContext = createContext<{
  isLoading: boolean;
  isScanning: boolean;
  newUpdate?: NewAppVersion;
  // ISO timestamp of the last completed scan (null until the first scan
  // finishes in this process). The sidebar renders this as a relative-time
  // indicator ("Last scanned: 12m ago") so users have at-a-glance health.
  lastScanAt?: string | null;
}>({
  isLoading: true,
  isScanning: false,
  lastScanAt: null,
});

/**
 * Global hook used to access the app state.
 */
export const useAppState = () => {
  const appState = useContext(AppStateContext);
  if (appState === undefined) {
    throw new Error('useAppState must be used within a AppStateProvider');
  }
  return appState;
};

// Create a provider for the session
export const AppStateProvider = ({ children }: React.PropsWithChildren) => {
  const { handleError } = useError();

  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [newUpdate, setNewUpdate] = useState<NewAppVersion | undefined>();
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);

  // Load the user on mount
  useEffect(() => {
    const asyncLoad = async () => {
      try {
        const { isScanning, newUpdate, lastScanAt: lastScanAtRes } = await getAppState();
        setIsScanning(isScanning);
        setNewUpdate(newUpdate);
        if (lastScanAtRes !== undefined) setLastScanAt(lastScanAtRes);
      } catch (error) {
        handleError({ error });
      }
    };

    asyncLoad().then(() => setIsLoading(false));
    const interval = setInterval(asyncLoad, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        isLoading,
        isScanning,
        newUpdate,
        lastScanAt,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};
