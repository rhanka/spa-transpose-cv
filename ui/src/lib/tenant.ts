export const DEFAULT_TENANT_SLUG = '_default';
export const RESERVED_TENANT_SEGMENTS = new Set(['admin', 'api', 'session']);

export interface TenantTheme {
  primaryColor?: string;
  primaryDark?: string;
  accentColor?: string;
  accentHover?: string;
  surfaceBorder?: string;
  surfaceSubtle?: string;
  fontHeading?: string;
  fontBody?: string;
  borderRadius?: string;
}

export interface TenantConfig {
  slug: string;
  displayName: string;
  routeBase: string;
  brandUrl: string;
  themeKey: string;
  templateKey: string;
  templateContractVersion: string;
  variant: string;
  active: boolean;
  theme?: TenantTheme;
  template?: {
    outputNaming?: string;
    sections?: string[];
    headerFields?: Record<string, string>;
  };
  templateContract?: {
    version: string;
    layout: {
      family: string;
      variant: string;
    };
  };
  branding?: {
    logoPath?: string;
    faviconPath?: string;
    subtitle?: string;
    heroBackground?: string;
    shellBackground?: string;
  };
}

export function resolveTenantSlugFromPath(pathname: string): string {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  if (!firstSegment || RESERVED_TENANT_SEGMENTS.has(firstSegment)) {
    return DEFAULT_TENANT_SLUG;
  }
  return firstSegment;
}

export function buildTenantPath(slug: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (slug === DEFAULT_TENANT_SLUG) {
    return normalizedPath;
  }
  if (normalizedPath === '/') {
    return `/${slug}`;
  }
  return `/${slug}${normalizedPath}`;
}

export function applyTenantTheme(theme?: TenantTheme | null): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const fallbackTheme: Required<TenantTheme> = {
    primaryColor: '#1B4F98',
    primaryDark: '#13386C',
    accentColor: '#11C4D4',
    accentHover: '#2BBDEE',
    surfaceBorder: '#D8E8F6',
    surfaceSubtle: '#F2F8FD',
    fontHeading: 'Poppins',
    fontBody: 'Inter',
    borderRadius: '16px',
  };
  const activeTheme = { ...fallbackTheme, ...(theme ?? {}) };

  root.style.setProperty('--color-purple-dark', activeTheme.primaryDark);
  root.style.setProperty('--color-purple', activeTheme.primaryColor);
  root.style.setProperty('--color-purple-light', activeTheme.primaryColor);
  root.style.setProperty('--color-purple-lighter', activeTheme.primaryDark);
  root.style.setProperty('--color-purple-border', activeTheme.surfaceBorder);
  root.style.setProperty('--color-purple-bg', activeTheme.surfaceSubtle);
  root.style.setProperty('--color-green', activeTheme.accentColor);
  root.style.setProperty('--color-green-hover', activeTheme.accentHover);
  root.style.setProperty('--color-gradient-start', activeTheme.primaryDark);
  root.style.setProperty('--color-gradient-end', activeTheme.accentColor);
  root.style.setProperty('--font-heading', `'${activeTheme.fontHeading}', system-ui, sans-serif`);
  root.style.setProperty('--font-body', `'${activeTheme.fontBody}', system-ui, -apple-system, Arial, sans-serif`);
  root.style.setProperty('--radius-base', activeTheme.borderRadius);
}

export function applyTenantBranding(config?: TenantConfig | null): void {
  if (typeof document === 'undefined') {
    return;
  }

  const faviconHref = config?.branding?.faviconPath ?? '/SENT-logo-squared.svg';
  const shellBackground = config?.branding?.shellBackground
    ?? config?.branding?.heroBackground
    ?? config?.theme?.primaryDark
    ?? '#13386C';
  const heroBackground = config?.branding?.heroBackground ?? shellBackground;
  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }

  if (/\.ico(?:$|\?)/i.test(faviconHref)) {
    favicon.type = 'image/x-icon';
  } else if (/\.svg(?:$|\?)/i.test(faviconHref)) {
    favicon.type = 'image/svg+xml';
  } else if (/\.png(?:$|\?)/i.test(faviconHref)) {
    favicon.type = 'image/png';
  } else if (/\.jpe?g(?:$|\?)/i.test(faviconHref)) {
    favicon.type = 'image/jpeg';
  } else {
    favicon.removeAttribute('type');
  }
  favicon.href = faviconHref;
  document.documentElement.style.setProperty('--tenant-shell-bg', shellBackground);
  document.documentElement.style.setProperty('--tenant-hero-bg', heroBackground);
  document.title = `${config?.displayName ?? 'Sent Tech'} | CV Transpose`;
}
