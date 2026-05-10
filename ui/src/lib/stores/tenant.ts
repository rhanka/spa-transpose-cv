import { writable } from 'svelte/store';
import type { TenantConfig } from '$lib/tenant';
import { DEFAULT_TENANT_SLUG } from '$lib/tenant';

export const tenantSlug = writable<string>(DEFAULT_TENANT_SLUG);
export const tenantConfig = writable<TenantConfig | null>(null);
export const tenantLoadError = writable<string>('');
