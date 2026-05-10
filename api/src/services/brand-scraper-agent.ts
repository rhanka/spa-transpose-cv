import { z } from 'zod';

const USER_AGENT = 'spa-transpose-cv-brand-scraper/1.0 (+https://cv.sent-tech.ca)';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_STYLESHEETS = 8;
const MAX_CSS_CHARS = 250_000;

const GENERIC_FONT_FAMILIES = new Set([
  '-apple-system',
  'arial',
  'apple color emoji',
  'blinkmacsystemfont',
  'consolas',
  'courier new',
  'cursive',
  'fantasy',
  'helvetica',
  'helvetica neue',
  'inherit',
  'initial',
  'liberation mono',
  'menlo',
  'monospace',
  'monaco',
  'noto color emoji',
  'roboto',
  'sans-serif',
  'segoe ui',
  'segoe ui emoji',
  'segoe ui symbol',
  'serif',
  'sfmono-regular',
  'system-ui',
  'ui-monospace',
  'ui-rounded',
  'ui-sans-serif',
  'ui-serif',
  'unset',
  'var(--font-body)',
  'var(--font-heading)',
]);

const ICON_FONT_PATTERN = /font\s*awesome|fontawesome/i;
const DISPLAY_FONT_PATTERN = /poppins|display|headline|title|titling|semibold|bold/i;
const BODY_FONT_PATTERN = /sans|text|body|regular|book|roman/i;

export const brandThemeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/),
  primaryDark: z.string().regex(/^#[0-9A-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-F]{6}$/),
  accentHover: z.string().regex(/^#[0-9A-F]{6}$/),
  surfaceBorder: z.string().regex(/^#[0-9A-F]{6}$/),
  surfaceSubtle: z.string().regex(/^#[0-9A-F]{6}$/),
  fontHeading: z.string().trim().min(1),
  fontBody: z.string().trim().min(1),
  borderRadius: z.string().trim().min(1),
}).strict();

export type BrandTheme = z.infer<typeof brandThemeSchema>;

export interface BrandScrapeResult {
  sourceUrl: string;
  finalUrl: string;
  fetchedAt: string;
  siteName: string;
  logoUrl: string | null;
  stylesheetUrls: string[];
  detected: {
    metaThemeColor: string | null;
    maskIconColor: string | null;
    logoColors: string[];
    colors: string[];
    fonts: string[];
  };
  mappedTheme: BrandTheme;
  notes: string[];
}

function normalizeHexColor(value: string): string | null {
  const raw = value.trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{3}$/.test(raw)) {
    return `#${raw.split('').map((char) => `${char}${char}`).join('').toUpperCase()}`;
  }
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function countValues(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function hexChannel(color: string, offset: number): number {
  return Number.parseInt(color.slice(offset, offset + 2), 16);
}

function brightness(color: string): number {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return 0;
  }
  return (
    (hexChannel(normalized, 1) * 299) +
    (hexChannel(normalized, 3) * 587) +
    (hexChannel(normalized, 5) * 114)
  ) / 1000;
}

function maxChannel(color: string): number {
  return Math.max(
    hexChannel(color, 1),
    hexChannel(color, 3),
    hexChannel(color, 5),
  );
}

function minChannel(color: string): number {
  return Math.min(
    hexChannel(color, 1),
    hexChannel(color, 3),
    hexChannel(color, 5),
  );
}

function colorSaturation(color: string): number {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return 0;
  }
  const max = maxChannel(normalized);
  const min = minChannel(normalized);
  return max === 0 ? 0 : ((max - min) / max);
}

function isNeutralColor(color: string): boolean {
  return colorSaturation(color) < 0.18;
}

function isLightColor(color: string): boolean {
  return brightness(color) >= 215;
}

function adjustColorChannel(channel: number, target: number, factor: number): number {
  return Math.round(channel + ((target - channel) * factor));
}

function tintColor(color: string, factor: number): string {
  const normalized = normalizeHexColor(color) ?? '#2C3E50';
  const channels = [1, 3, 5].map((offset) =>
    adjustColorChannel(hexChannel(normalized, offset), 255, factor).toString(16).padStart(2, '0').toUpperCase());
  return `#${channels.join('')}`;
}

function shadeColor(color: string, factor: number): string {
  const normalized = normalizeHexColor(color) ?? '#2C3E50';
  const channels = [1, 3, 5].map((offset) =>
    adjustColorChannel(hexChannel(normalized, offset), 0, factor).toString(16).padStart(2, '0').toUpperCase());
  return `#${channels.join('')}`;
}

function extractAllHexColors(text: string): string[] {
  return unique(
    [...text.matchAll(/#[0-9A-Fa-f]{3,6}\b/g)]
      .map((match) => normalizeHexColor(match[0]))
      .filter((value): value is string => Boolean(value)),
  );
}

function extractMetaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractTitle(html: string): string {
  const ogSiteName = extractMetaContent(html, 'og:site_name');
  if (ogSiteName) {
    return ogSiteName;
  }

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return title || 'Brand';
}

function extractStylesheetUrls(html: string, pageUrl: string): string[] {
  const links = [...html.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]+href=["']([^"']+)["']/gi)]
    .map((match) => match[1]?.trim())
    .filter((href): href is string => Boolean(href));

  return unique(
    links
      .slice(0, MAX_STYLESHEETS * 2)
      .map((href) => {
        try {
          return new URL(href, pageUrl).toString();
        } catch {
          return null;
        }
      })
      .filter((value): value is string => Boolean(value))
      .slice(0, MAX_STYLESHEETS),
  );
}

function extractInlineStyles(html: string): string[] {
  return [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)]
    .filter((match) => !/wp-img-auto-sizes|global-styles-inline-css|classic-theme-styles-inline-css/i.test(match[1] ?? ''))
    .map((match) => match[2]?.trim())
    .filter((value): value is string => Boolean(value));
}

function isBrandStylesheetUrl(url: string): boolean {
  return !/wp\/wp-includes|plugins\/fulltext-search/i.test(url);
}

function extractLogoUrl(html: string, pageUrl: string): string | null {
  const logoImg = html.match(/<img[^>]+class=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*logo[^"']*["']/i)?.[1];
  if (logoImg) {
    try {
      return new URL(logoImg, pageUrl).toString();
    } catch {
      return logoImg;
    }
  }

  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(block);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== 'object') {
          continue;
        }
        if (typeof current.logo === 'string') {
          return new URL(current.logo, pageUrl).toString();
        }
        if (current.logo && typeof current.logo === 'object') {
          const candidate = current.logo.url ?? current.logo.contentUrl;
          if (typeof candidate === 'string') {
            return new URL(candidate, pageUrl).toString();
          }
        }
        Object.values(current).forEach((value) => {
          if (value && typeof value === 'object') {
            queue.push(value);
          }
        });
      }
    } catch {
      continue;
    }
  }

  const iconHref = html.match(/<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1];
  if (iconHref) {
    try {
      return new URL(iconHref, pageUrl).toString();
    } catch {
      return iconHref;
    }
  }

  const ogImage = extractMetaContent(html, 'og:image');
  if (ogImage && /logo|icon|brand/i.test(ogImage)) {
    try {
      return new URL(ogImage, pageUrl).toString();
    } catch {
      return ogImage;
    }
  }

  return null;
}

function extractFontFamilies(text: string): string[] {
  const families = [...text.matchAll(/font-family\s*:\s*([^;}{]+)/gi)]
    .flatMap((match) => match[1]?.split(',') ?? [])
    .map((font) => font.trim().replace(/^['"(]+|['")]+$/g, ''))
    .filter((font) => font !== '' && !font.startsWith('var('))
    .filter((font) => !ICON_FONT_PATTERN.test(font))
    .filter((font) => !GENERIC_FONT_FAMILIES.has(font.toLowerCase()));

  return countValues(families).map(([font]) => font);
}

function pickHeadingFont(fonts: string[], fallback: string): string {
  return fonts.find((font) => DISPLAY_FONT_PATTERN.test(font))
    ?? fonts[0]
    ?? fallback;
}

function pickBodyFont(fonts: string[], headingFont: string, fallback: string): string {
  return fonts.find((font) => font !== headingFont && BODY_FONT_PATTERN.test(font))
    ?? fonts.find((font) => font !== headingFont)
    ?? headingFont
    ?? fallback;
}

function selectThemeColors(params: {
  metaThemeColor: string | null;
  maskIconColor: string | null;
  logoColors: string[];
  colors: string[];
}): Pick<BrandTheme, 'primaryColor' | 'primaryDark' | 'accentColor' | 'accentHover' | 'surfaceBorder' | 'surfaceSubtle'> {
  const normalizedMeta = normalizeHexColor(params.metaThemeColor ?? '');
  const normalizedMask = normalizeHexColor(params.maskIconColor ?? '');
  const palette = unique(
    [normalizedMeta, normalizedMask, ...params.logoColors, ...params.colors]
      .filter((value): value is string => Boolean(value)),
  );

  const strongColors = palette.filter((color) => !isNeutralColor(color));
  const darkStrongColors = strongColors.filter((color) => brightness(color) < 180);
  const lightNeutralColors = palette.filter((color) => isLightColor(color));

  const primaryColor = darkStrongColors[0]
    ?? strongColors[0]
    ?? normalizedMask
    ?? normalizedMeta
    ?? '#2C3E50';

  const accentColor = params.logoColors.find((color) => color !== primaryColor)
    ?? strongColors.find((color) => color !== primaryColor)
    ?? palette.find((color) => color !== primaryColor)
    ?? tintColor(primaryColor, 0.22);

  const surfaceSubtle = lightNeutralColors.find((color) => color !== accentColor)
    ?? tintColor(primaryColor, 0.9);

  const surfaceBorder = lightNeutralColors.find((color) => color !== surfaceSubtle && color !== accentColor)
    ?? tintColor(primaryColor, 0.8);

  return {
    primaryColor,
    primaryDark: shadeColor(primaryColor, 0.18),
    accentColor,
    accentHover: shadeColor(accentColor, 0.12),
    surfaceBorder,
    surfaceSubtle,
  };
}

async function fetchText(url: string): Promise<{ finalUrl: string; text: string }> {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,text/css,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return {
    finalUrl: response.url,
    text: await response.text(),
  };
}

export async function scrapeBrandTheme(sourceUrl: string): Promise<BrandScrapeResult> {
  const { finalUrl, text: html } = await fetchText(sourceUrl);
  const stylesheetUrls = extractStylesheetUrls(html, finalUrl);
  const inlineStyles = extractInlineStyles(html);

  const stylesheetContents = await Promise.all(
    stylesheetUrls.map(async (url) => {
      try {
        const { text } = await fetchText(url);
        return text.slice(0, MAX_CSS_CHARS);
      } catch {
        return '';
      }
    }),
  );

  const brandStylesheetContents = stylesheetContents.filter((_, index) => isBrandStylesheetUrl(stylesheetUrls[index] ?? ''));
  const effectiveStylesheetContents = brandStylesheetContents.length > 0 ? brandStylesheetContents : stylesheetContents;
  const cssCorpus = [...inlineStyles, ...effectiveStylesheetContents].join('\n');
  const metaThemeColor = normalizeHexColor(extractMetaContent(html, 'theme-color') ?? '');
  const maskIconColor = normalizeHexColor(
    html.match(/<link[^>]+rel=["']mask-icon["'][^>]+color=["']([^"']+)["']/i)?.[1] ?? '',
  );
  const logoColors = unique([
    ...extractAllHexColors(
      html.match(/<svg[\s\S]*?<\/svg>/i)?.[0]
        ?? html.match(/<a[^>]+class=["'][^"']*logo[^"']*["'][\s\S]*?<\/a>/i)?.[0]
        ?? '',
    ),
  ]);

  const colors = countValues(extractAllHexColors(cssCorpus))
    .map(([color]) => color)
    .slice(0, 24);

  const fonts = unique([
    ...extractFontFamilies(html),
    ...extractFontFamilies(cssCorpus),
  ]).slice(0, 12);

  const mappedColors = selectThemeColors({
    metaThemeColor,
    maskIconColor,
    logoColors,
    colors,
  });

  const fontHeading = pickHeadingFont(fonts, 'Poppins');
  const fontBody = pickBodyFont(fonts, fontHeading, 'Inter');

  const mappedTheme = brandThemeSchema.parse({
    ...mappedColors,
    fontHeading,
    fontBody,
    borderRadius: '0px',
  });

  return {
    sourceUrl,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    siteName: extractTitle(html),
    logoUrl: extractLogoUrl(html, finalUrl),
    stylesheetUrls,
    detected: {
      metaThemeColor,
      maskIconColor,
      logoColors,
      colors,
      fonts,
    },
    mappedTheme,
    notes: [
      'Limited mapping to tenant-rendered theme tokens only.',
      'Palette derived from HTML, inline SVG and linked stylesheets; layout components are intentionally ignored.',
    ],
  };
}
