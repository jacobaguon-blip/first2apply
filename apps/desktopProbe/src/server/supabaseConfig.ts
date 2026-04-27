import { createClient } from '@supabase/supabase-js';
import Storage from 'electron-store';

import { ENV } from '../env';

type StoredConfig = {
  supabaseUrl?: string;
  supabaseKey?: string;
};

const configStore = new Storage<StoredConfig>({ name: 'backend-config' });

export type SupabaseConfig = {
  url: string;
  key: string;
  source: 'user' | 'env' | 'none';
};

export function getSupabaseConfig(): SupabaseConfig {
  const userUrl = configStore.get('supabaseUrl');
  const userKey = configStore.get('supabaseKey');
  if (userUrl && userKey) return { url: userUrl, key: userKey, source: 'user' };

  if (ENV.supabase.url && ENV.supabase.key) {
    return { url: ENV.supabase.url, key: ENV.supabase.key, source: 'env' };
  }

  return { url: '', key: '', source: 'none' };
}

export function setSupabaseConfig({ url, key }: { url: string; key: string }): void {
  configStore.set('supabaseUrl', url);
  configStore.set('supabaseKey', key);
}

export function clearSupabaseConfigOverride(): void {
  configStore.delete('supabaseUrl');
  configStore.delete('supabaseKey');
}

export async function testSupabaseConnection({ url, key }: { url: string; key: string }): Promise<void> {
  if (!url || !key) throw new Error('URL and anon key are required');
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.auth.getSession();
  if (error) throw new Error(error.message);
}
