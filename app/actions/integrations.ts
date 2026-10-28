'use server';

import { revalidatePath } from 'next/cache';
import { disconnectIntegration, saveApiKey, setConnectedAppActive } from '@/lib/services/integrations';
import { hevySyncDeps } from '@/lib/services/hevySyncDeps';
import type { ServiceResult } from '@/lib/services/result';
import { runHevySync } from '@/lib/services/syncedEntries';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { ConnectFormState, HevySyncView, IntegrationAccount } from '@/types/integrations';

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

// The Hevy key form (MOM-62). Runs only when the user submits it. The provider is fixed here, not read from the
// form, and the key goes straight to saveApiKey(), which validates its shape and stores it where no browser role
// can read it. What comes back to the form is a message: never the key, never a stored value, so the form cannot
// echo it, and nothing about it reaches client state.
export async function saveHevyApiKey(_previous: ConnectFormState, formData: FormData): Promise<ConnectFormState> {
  const key = formData.get('apiKey');
  if (typeof key !== 'string' || key.trim() === '') return { error: 'Paste your Hevy API key.', notice: null };
  const result = await saveApiKey('hevy', key);
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath('/connections');
  revalidatePath('/');
  return { error: null, notice: 'Hevy is connected.' };
}

// The Disconnect button (MOM-62): deletes the stored credential and switches the app off. Takes `unknown` like the
// other actions; the service checks it names a supported app and that someone is signed in.
export async function disconnectApp(provider: unknown): Promise<ServiceResult<IntegrationAccount>> {
  const result = await disconnectIntegration(provider);
  if (result.ok) {
    revalidatePath('/connections');
    revalidatePath('/');
  }
  return result;
}

// The "Sync now" button on the Hevy card (MOM-129). Takes nothing: it syncs the signed-in person's own Hevy, on their
// own session, and answers in words for the card (never a key, a raw result or anything Hevy wrote). The service
// allows one sync at a time per person.
export async function syncHevyNow(): Promise<ServiceResult<HevySyncView>> {
  const result = await runHevySync(await hevySyncDeps());
  if (result.ok) {
    // A refused key changes the card's status, and new entries change Home.
    revalidatePath('/connections');
    revalidatePath('/');
  }
  return result;
}
