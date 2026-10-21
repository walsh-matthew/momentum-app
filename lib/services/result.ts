// Shared return shape for service methods. Services return errors as values so UI code
// never has to guess which exceptions to catch.
export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };
