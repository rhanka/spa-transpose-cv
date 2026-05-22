import { DEFAULT_TENANT_SLUG, type TenantConfig } from '$lib/tenant';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json() as { error?: string; code?: string };
    if (data.error) {
      return data.error;
    }
    if (data.code) {
      return data.code;
    }
  } catch {
    try {
      const text = await res.text();
      if (text.trim()) {
        return text.trim();
      }
    } catch {
      // ignore
    }
  }

  return fallback;
}

export interface ProviderInfo {
  id: string;
  modelId: string;
  label: string;
  costPer1MInput: number;
  costPer1MOutput: number;
  co2ePer1kOutput: number;
}

export interface ModelsResponse {
  active: string;
  providers: ProviderInfo[];
}

export interface ClaimOtpResponse {
  challengeId: string;
  slug: string;
  companyDomain: string;
  expiresAt: string;
  delivery: 'smtp' | 'log';
  devOtp?: string;
}

export interface AdminTenantCreateResponse {
  slug: string;
  displayName: string;
  active: boolean;
  routeBase: string;
  tenantKeyPrefix: string;
  templateProfile: 'scalian' | 'cgi';
  companyUrl: string;
}

export interface AdminSessionResponse {
  token: string;
  expiresAt: string;
  role: 'root-admin';
}

export interface TenantMarketplacePublication {
  slug: string;
  displayName: string;
  active: boolean;
  status: 'draft' | 'published';
  tenantKey: string;
  assets: {
    manifestUrl: string;
    baseDocxUrl: string;
    brandUrl: string;
    authTenantClaim: 'tk';
  };
}

export interface TenantMarketplacePublicationsResponse {
  tenants: TenantMarketplacePublication[];
}

export type TemplateRenderer = 'generic' | 'legacy-scalian';

function getSessionApiBase(tenantSlug = DEFAULT_TENANT_SLUG): string {
  return tenantSlug === DEFAULT_TENANT_SLUG
    ? `${API_BASE}/sessions`
    : `${API_BASE}/tenants/${tenantSlug}/sessions`;
}

export async function fetchTenantConfig(slug = DEFAULT_TENANT_SLUG): Promise<TenantConfig> {
  const path = slug === DEFAULT_TENANT_SLUG
    ? `${API_BASE}/tenants/config`
    : `${API_BASE}/tenants/${slug}/config`;
  const res = await fetch(path);
  if (!res.ok) throw new Error(await readApiError(res, `Chargement de la configuration impossible (${res.status})`));
  return res.json();
}

export async function getModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error(await readApiError(res, `Chargement des modèles impossible (${res.status})`));
  return res.json();
}

export async function requestClaimOtp(params: {
  companyUrl: string;
  corporateEmail: string;
  slug?: string;
}): Promise<ClaimOtpResponse> {
  const res = await fetch(`${API_BASE}/admin/claims/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readApiError(res, `Envoi du code impossible (${res.status})`));
  return res.json();
}

export async function createTenantViaAdmin(params: {
  companyUrl: string;
  corporateEmail: string;
  templateFile: File;
  challengeId?: string;
  otp?: string;
  rootAdminPassword?: string;
  slug?: string;
}): Promise<AdminTenantCreateResponse> {
  const form = new FormData();
  form.set('companyUrl', params.companyUrl);
  form.set('corporateEmail', params.corporateEmail);
  form.set('templateFile', params.templateFile);
  if (params.challengeId) form.set('challengeId', params.challengeId);
  if (params.otp) form.set('otp', params.otp);
  if (params.rootAdminPassword) form.set('rootAdminPassword', params.rootAdminPassword);
  if (params.slug) form.set('slug', params.slug);

  const res = await fetch(`${API_BASE}/admin/tenants`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await readApiError(res, `Création de l’espace impossible (${res.status})`));
  return res.json();
}

export async function createAdminSession(password: string): Promise<AdminSessionResponse> {
  const res = await fetch(`${API_BASE}/admin/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await readApiError(res, `Connexion admin impossible (${res.status})`));
  return res.json();
}

function adminAuthorizationHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchTenantMarketplacePublications(
  token: string,
): Promise<TenantMarketplacePublicationsResponse> {
  const res = await fetch(`${API_BASE}/admin/tenants/publications`, {
    headers: adminAuthorizationHeaders(token),
  });
  if (!res.ok) throw new Error(await readApiError(res, `Chargement des publications impossible (${res.status})`));
  return res.json();
}

export async function fetchTenantMarketplacePublicationByTenantKey(
  token: string,
  tenantKey: string,
): Promise<TenantMarketplacePublication> {
  const res = await fetch(`${API_BASE}/admin/tenant-publications/${encodeURIComponent(tenantKey)}`, {
    headers: adminAuthorizationHeaders(token),
  });
  if (!res.ok) throw new Error(await readApiError(res, `Publication introuvable (${res.status})`));
  return res.json();
}

export async function createSession(
  password: string,
  tenantSlug = DEFAULT_TENANT_SLUG,
  options?: { renderer?: TemplateRenderer },
): Promise<{ sessionId: string; expiresAt: string; tenant: string; renderer?: TemplateRenderer }> {
  const body: Record<string, string> = { password };
  if (options?.renderer) body.renderer = options.renderer;
  const res = await fetch(getSessionApiBase(tenantSlug), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res, `Création de la session impossible (${res.status})`));
  return res.json();
}

export async function uploadFiles(
  sessionId: string,
  password: string,
  files: File[],
  tenantSlug = DEFAULT_TENANT_SLUG,
): Promise<{ uploaded: number }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await fetch(`${getSessionApiBase(tenantSlug)}/${sessionId}/upload`, {
    method: 'POST',
    headers: { 'X-Session-Password': password },
    body: form,
  });
  if (!res.ok) throw new Error(await readApiError(res, `Envoi des fichiers impossible (${res.status})`));
  return res.json();
}

export async function markReady(
  sessionId: string,
  password: string,
  prompt: string,
  options?: {
    provider?: string;
    targetCompany?: string;
  },
  tenantSlug = DEFAULT_TENANT_SLUG,
): Promise<void> {
  const body: Record<string, string> = { prompt };
  if (options?.provider) body.provider = options.provider;
  if (options?.targetCompany) body.targetCompany = options.targetCompany;
  const res = await fetch(`${getSessionApiBase(tenantSlug)}/${sessionId}/ready`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Password': password },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res, `Préparation de la session impossible (${res.status})`));
}

export async function startProcessing(
  sessionId: string,
  password: string,
  tenantSlug = DEFAULT_TENANT_SLUG,
): Promise<void> {
  const res = await fetch(`${getSessionApiBase(tenantSlug)}/${sessionId}/run`, {
    method: 'POST',
    headers: { 'X-Session-Password': password },
  });
  if (!res.ok) throw new Error(await readApiError(res, `Lancement du traitement impossible (${res.status})`));
}

export interface FileStatus {
  name: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  output?: string;
}

export interface StreamEvent {
  type: 'stream';
  fileIndex: number;
  phase: string;
  thinking_delta?: string;
  content_delta?: string;
  parsed_keys?: Record<string, unknown>;
  elapsed_ms?: number;
  error?: string;
  attention_cv?: string;
  attention_trad?: string;
  tokenInfo?: string;
}

export interface StatusEvent {
  type: 'status';
  status: string;
  files: FileStatus[];
  expiresAt: string;
}

export type SseData = StreamEvent | StatusEvent;

export function subscribeStatus(
  sessionId: string,
  onMessage: (data: SseData) => void,
  tenantSlug = DEFAULT_TENANT_SLUG,
): EventSource {
  const es = new EventSource(`${getSessionApiBase(tenantSlug)}/${sessionId}/status`);
  es.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as SseData);
    } catch { /* ignore */ }
  };
  return es;
}

export async function getResults(
  sessionId: string,
  tenantSlug = DEFAULT_TENANT_SLUG,
): Promise<StatusEvent & { outputs: string[]; tenant: string }> {
  const res = await fetch(`${getSessionApiBase(tenantSlug)}/${sessionId}/results`);
  if (!res.ok) throw new Error(await readApiError(res, `Chargement des résultats impossible (${res.status})`));
  return res.json();
}

export async function downloadFile(
  sessionId: string,
  password: string,
  fileName: string,
  tenantSlug = DEFAULT_TENANT_SLUG,
): Promise<Blob> {
  const res = await fetch(`${getSessionApiBase(tenantSlug)}/${sessionId}/download/${encodeURIComponent(fileName)}`, {
    headers: { 'X-Session-Password': password },
  });
  if (!res.ok) throw new Error(await readApiError(res, `Téléchargement impossible (${res.status})`));
  return res.blob();
}
