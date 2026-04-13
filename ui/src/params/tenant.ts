import { RESERVED_TENANT_SEGMENTS } from '$lib/tenant';

export function match(param: string): boolean {
  return /^[a-z0-9_][a-z0-9_-]*$/i.test(param) && !RESERVED_TENANT_SEGMENTS.has(param.toLowerCase());
}
