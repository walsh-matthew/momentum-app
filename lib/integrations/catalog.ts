// Presentation data for the integration cards. Kept apart from @/lib/services/integrations so
// client components can import it without pulling in server-only code.
// Phase 1 scope is Hevy and Google Calendar only (docs/INTEGRATIONS_SPEC.md §4).

export interface IntegrationCatalogEntry {
  provider: 'hevy' | 'google_calendar';
  name: string;
  description: string;
}

export const INTEGRATION_CATALOG: readonly IntegrationCatalogEntry[] = [
  {
    provider: 'hevy',
    name: 'Hevy',
    description: 'Count your strength workouts toward your fitness goals automatically.',
  },
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Count finished focus blocks and events toward your career goals.',
  },
];

export const SUPPORTED_PROVIDER_IDS: readonly string[] = INTEGRATION_CATALOG.map((e) => e.provider);
