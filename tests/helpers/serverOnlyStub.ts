// Stands in for the `server-only` package under Vitest. Next.js makes that import fail a build when a
// Client Component reaches it; the tests run on the server, so it is an empty module here.
export {};
