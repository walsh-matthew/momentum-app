// Presentation data for the integration cards. Kept apart from @/lib/services/integrations so
// client components can import it without pulling in server-only code.
// Phase 1 scope is Hevy and Google Calendar only (docs/INTEGRATIONS_SPEC.md §4).

import type { IntegrationAuthType } from '@/types/database.types';

export interface IntegrationCatalogEntry {
  provider: 'hevy' | 'google_calendar';
  name: string;
  description: string;
  // How the user connects: a pasted API key (Hevy) or a Google sign-in (INTEGRATIONS_SPEC.md §3).
  authType: IntegrationAuthType;
}

export const INTEGRATION_CATALOG: readonly IntegrationCatalogEntry[] = [
  {
    provider: 'hevy',
    name: 'Hevy',
    description: 'Count your strength workouts toward your fitness goals automatically.',
    authType: 'api_key',
  },
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Count finished focus blocks and events toward your career goals.',
    authType: 'oauth2',
  },
];

export const SUPPORTED_PROVIDER_IDS: readonly string[] = INTEGRATION_CATALOG.map((e) => e.provider);

export function authTypeOf(provider: string): IntegrationAuthType | undefined {
  return INTEGRATION_CATALOG.find((e) => e.provider === provider)?.authType;
}
