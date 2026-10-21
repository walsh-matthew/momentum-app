'use server';

import { revalidatePath } from 'next/cache';
import { setConnectedAppActive } from '@/lib/services/integrations';
import type { ServiceResult } from '@/lib/services/result';
import type { ConnectedAppPublic } from '@/types/database.types';

// Server Actions are reachable by direct POST, so this takes `unknown` and the service validates
// and authenticates (via the session cookie).
export async function toggleConnectedApp(
  provider: unknown,
  isActive: unknown,
): Promise<ServiceResult<ConnectedAppPublic>> {
  const result = await setConnectedAppActive(provider, isActive);
  if (result.ok) revalidatePath('/');
  return result;
}
