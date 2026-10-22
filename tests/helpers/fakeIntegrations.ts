// In-memory stand-ins for the two Supabase clients lib/services/integrations.ts uses:
// - createSupabaseServerClient: the signed-in user's session. connected_apps is visible and writable
//   only for their own rows (row level security). integration_credentials is NOT reachable: the real
//   table has no grants for the API roles (migration 005), so any query fails with 42501.
// - createSupabaseAdminClient: the service role. It BYPASSES row level security, so a query that is not
//   scoped to a user id sees every user's rows. That is the point: tests prove the service scopes
//   itself, since nothing else will.
// The fake enforces the integration_credentials rules from migration 005 (same-owner foreign key to
// connected_apps, one credential per user and provider, secrets matching the auth type, status list)
// and, like Postgres, puts the offending row in the error text, so tests can prove the service never
// passes a database error on to a caller. tests/migrations.test.ts checks these rules exist in the SQL.

export interface AppRow {
  id: string;
  user_id: string;
  provider: string;
  is_active: boolean;
  goal_channel_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredRow {
  id: string;
  user_id: string;
  provider: string;
  auth_type: 'oauth2' | 'api_key';
  access_token: string | null;
  refresh_token: string | null;
  api_key: string | null;
  expires_at: string | null;
  scope: string | null;
  status: 'connected' | 'needs_reauth' | 'error';
  last_error: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

type Row = Record<string, unknown>;
type Table = 'connected_apps' | 'integration_credentials';

export const idb = {
  user: null as { id: string } | null,
  apps: [] as AppRow[],
  creds: [] as CredRow[],
  // Every column list passed to select() on integration_credentials, to prove what was read.
  credSelects: [] as string[],
  // Count of calls made through the admin client, to prove a refused call never reached it.
  adminCalls: 0,
  // When set, the next admin write fails with this message (a stand-in for a Postgres error that
  // quotes the row).
  failNextAdminWrite: null as string | null,
  clock: 0,
};

export function resetIdb(user: { id: string } | null = null): void {
  idb.user = user;
  idb.apps = [];
  idb.creds = [];
  idb.credSelects = [];
  idb.adminCalls = 0;
  idb.failNextAdminWrite = null;
  idb.clock = 0;
}

const stamp = () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++idb.clock)).toISOString();
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function credViolation(c: CredRow): string | null {
  if (!['oauth2', 'api_key'].includes(c.auth_type)) return 'integration_credentials_auth_type_check';
  if (!['connected', 'needs_reauth', 'error'].includes(c.status)) return 'integration_credentials_status_check';
  const oauthOk = c.auth_type === 'oauth2' && c.access_token !== null && c.api_key === null;
  const keyOk =
    c.auth_type === 'api_key' && c.api_key !== null && c.access_token === null && c.refresh_token === null && c.expires_at === null;
  if (!oauthOk && !keyOk) return 'integration_credentials_secret_matches_type';
  if ([c.access_token, c.refresh_token, c.api_key].some((s) => s === '')) return 'integration_credentials_secrets_not_blank';
  if (!idb.apps.some((a) => a.user_id === c.user_id && a.provider === c.provider)) {
    return 'integration_credentials_app_fk';
  }
  return null;
}

class Query {
  private op: 'select' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row = {};
  private conflict = 'user_id,provider';
  private cols: string | undefined;
  private filters: Array<(r: Row) => boolean> = [];
  private orderCol: string | undefined;
  private returning = false;

  constructor(
    private readonly table: Table,
    private readonly admin: boolean,
  ) {}

  private all(): Row[] {
    return (this.table === 'connected_apps' ? idb.apps : idb.creds) as unknown as Row[];
  }
  private visible(): Row[] {
    if (this.admin) return this.all();
    // Row level security on connected_apps: only the signed-in user's own rows.
    return this.all().filter((r) => idb.user !== null && r.user_id === idb.user.id);
  }

  select(cols?: string) {
    this.cols = cols;
    if (this.op !== 'select') this.returning = true;
    else if (this.table === 'integration_credentials') idb.credSelects.push(cols ?? '*');
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  upsert(row: Row, opts: { onConflict?: string } = {}) {
    this.op = 'upsert';
    this.payload = row;
    if (opts.onConflict) this.conflict = opts.onConflict;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  order(col: string) {
    this.orderCol = col;
    return this;
  }

  private project(r: Row): Row {
    if (!this.cols || this.cols === '*') return { ...r };
    return Object.fromEntries(
      this.cols
        .split(',')
        .map((c) => c.trim())
        .map((c) => [c, r[c]]),
    );
  }

  private fail(message: string) {
    return { data: null as Row[] | null, error: { message } };
  }

  private run(): { data: Row[] | null; error: { message: string } | null } {
    if (!this.admin && this.table === 'integration_credentials') {
      return this.fail('permission denied for table integration_credentials');
    }
    if (this.admin) {
      idb.adminCalls++;
      if (this.op !== 'select' && idb.failNextAdminWrite) {
        const message = idb.failNextAdminWrite;
        idb.failNextAdminWrite = null;
        return this.fail(message);
      }
    }

    const matched = this.visible().filter((r) => this.filters.every((f) => f(r)));

    if (this.op === 'select') {
      const rows = [...matched];
      if (this.orderCol) rows.sort((a, b) => String(a[this.orderCol!]).localeCompare(String(b[this.orderCol!])));
      return { data: rows.map((r) => this.project(r)), error: null };
    }

    if (this.op === 'delete') {
      const gone = new Set(matched);
      const keep = this.all().filter((r) => !gone.has(r));
      this.all().splice(0, this.all().length, ...keep);
      if (this.table === 'connected_apps') {
        // ON DELETE CASCADE from connected_apps to integration_credentials.
        const left = idb.creds.filter((c) => idb.apps.some((a) => a.user_id === c.user_id && a.provider === c.provider));
        idb.creds.splice(0, idb.creds.length, ...left);
      }
      return { data: [], error: null };
    }

    if (this.op === 'update') {
      const changed: Row[] = [];
      for (const r of matched) {
        const next = { ...r, ...this.payload, updated_at: stamp() };
        if (this.table === 'integration_credentials') {
          const v = credViolation(next as unknown as CredRow);
          if (v) return this.fail(`new row violates check constraint "${v}". Failing row contains (${JSON.stringify(next)})`);
        }
        Object.assign(r, next);
        changed.push(r);
      }
      return { data: this.returning ? changed.map((r) => this.project(r)) : [], error: null };
    }

    // upsert on the (user_id, provider) key
    const keys = this.conflict.split(',');
    const existing = this.all().find((r) => keys.every((k) => r[k] === this.payload[k]));
    const visibleToCaller = existing && this.visible().includes(existing);
    if (!this.admin && this.table === 'connected_apps' && this.payload.user_id !== idb.user?.id) {
      return this.fail('new row violates row-level security policy for table "connected_apps"');
    }
    if (existing && !visibleToCaller) return this.fail('new row violates row-level security policy');

    let row: Row;
    if (existing) {
      row = Object.assign(existing, this.payload, { updated_at: stamp() });
    } else if (this.table === 'connected_apps') {
      row = {
        id: uid(),
        goal_channel_id: null,
        last_synced_at: null,
        is_active: false,
        created_at: stamp(),
        updated_at: stamp(),
        ...this.payload,
      };
    } else {
      row = {
        id: uid(),
        access_token: null,
        refresh_token: null,
        api_key: null,
        expires_at: null,
        scope: null,
        status: 'connected',
        last_error: null,
        last_refreshed_at: null,
        created_at: stamp(),
        updated_at: stamp(),
        ...this.payload,
      };
    }
    if (this.table === 'integration_credentials') {
      const v = credViolation(row as unknown as CredRow);
      if (v) {
        return this.fail(`new row violates check constraint "${v}". Failing row contains (${JSON.stringify(row)})`);
      }
    }
    if (!existing) this.all().push(row);
    return { data: [row], error: null };
  }

  single() {
    const { data, error } = this.run();
    if (error) return Promise.resolve({ data: null, error });
    const row = data?.[0];
    return Promise.resolve(row ? { data: this.project(row), error: null } : { data: null, error: { message: 'no row' } });
  }
  maybeSingle() {
    const { data, error } = this.run();
    return Promise.resolve({ data: data?.[0] ? this.project(data[0]) : null, error });
  }
  then<T>(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => T, reject?: (e: unknown) => T) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

export async function createSupabaseServerClient() {
  return {
    auth: {
      getUser: async () =>
        idb.user
          ? { data: { user: idb.user }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing' } },
    },
    from: (table: string) => new Query(table as Table, false),
  };
}

export function createSupabaseAdminClient() {
  return { from: (table: string) => new Query(table as Table, true) };
}

export const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// A connected app plus its credential, as left by a completed connect, for tests that start there.
export function seedConnection(userId: string, provider: string, cred: Partial<CredRow> & Pick<CredRow, 'auth_type'>): CredRow {
  idb.apps.push({
    id: uid(),
    user_id: userId,
    provider,
    is_active: true,
    goal_channel_id: null,
    last_synced_at: null,
    created_at: stamp(),
    updated_at: stamp(),
  });
  const row: CredRow = {
    id: uid(),
    user_id: userId,
    provider,
    access_token: null,
    refresh_token: null,
    api_key: null,
    expires_at: null,
    scope: null,
    status: 'connected',
    last_error: null,
    last_refreshed_at: null,
    created_at: stamp(),
    updated_at: stamp(),
    ...cred,
  };
  idb.creds.push(row);
  return row;
}
