<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import '../app.css';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import { fetchTenantConfig } from '$lib/api';
  import { applyTenantBranding, applyTenantTheme, buildTenantPath, DEFAULT_TENANT_SLUG, resolveTenantSlugFromPath } from '$lib/tenant';
  import { tenantConfig, tenantLoadError, tenantSlug } from '$lib/stores/tenant';

  let { children } = $props();
  let loadingTenant = $state(false);
  let requestVersion = 0;

  const activeTenantSlug = $derived($tenantSlug);
  const activeBranding = $derived($tenantConfig?.branding);
  const homeHref = $derived(buildTenantPath(activeTenantSlug, '/'));
  const showDefaultWordmark = $derived(activeTenantSlug === DEFAULT_TENANT_SLUG && activeBranding?.logoPath === '/SENT-logo.png');
  const isDefaultLanding = $derived(activeTenantSlug === DEFAULT_TENANT_SLUG && $page.url.pathname === '/');
  const sentTechNavLinks = [
    { label: 'Services', href: 'https://www.sent-tech.ca/#services' },
    { label: 'Secteurs', href: 'https://www.sent-tech.ca/#sectors' },
    { label: 'Valeurs', href: 'https://www.sent-tech.ca/#values' },
    { label: 'Blog', href: 'https://www.sent-tech.ca/blog' },
    { label: 'À propos', href: 'https://www.sent-tech.ca/#about' },
    { label: 'Contact', href: 'https://www.sent-tech.ca/#contact' },
  ];

  async function syncTenant(pathname: string) {
    const currentRequest = ++requestVersion;
    const nextSlug = resolveTenantSlugFromPath(pathname);
    tenantSlug.set(nextSlug);
    loadingTenant = true;

    try {
      const config = await fetchTenantConfig(nextSlug);
      if (currentRequest !== requestVersion) return;
      tenantConfig.set(config);
      tenantLoadError.set('');
      applyTenantTheme(config.theme);
      applyTenantBranding(config);
    } catch (err) {
      if (currentRequest !== requestVersion) return;
      tenantConfig.set(null);
      tenantLoadError.set(`Chargement de l'espace "${nextSlug}" impossible`);
      applyTenantTheme(null);
      applyTenantBranding(null);
    } finally {
      if (currentRequest === requestVersion) {
        loadingTenant = false;
      }
    }
  }

  $effect(() => {
    syncTenant($page.url.pathname);
  });

  onDestroy(() => {
    applyTenantTheme(null);
    applyTenantBranding(null);
  });
</script>

<Disclaimer />

<div class="min-h-screen flex flex-col">
  <header
    class:tenant-header--overlay={isDefaultLanding}
    style={!isDefaultLanding ? 'background: var(--tenant-shell-bg, var(--color-purple-dark));' : ''}
  >
    <div
      class="max-w-[1216px] mx-auto px-4 flex items-center justify-between gap-4"
      class:tenant-header-row--overlay={isDefaultLanding}
      style="padding-top: 1.25rem; padding-bottom: 1.25rem;"
    >
      <a href={homeHref} class="flex items-center gap-3">
        {#if activeBranding?.logoPath}
          <img
            class="tenant-logo"
            class:tenant-logo--wordmark={showDefaultWordmark}
            class:tenant-logo--inverted={showDefaultWordmark}
            class:tenant-logo--landing={isDefaultLanding}
            src={activeBranding.logoPath}
            alt={$tenantConfig?.displayName ?? 'Sent Tech'}
          />
        {:else}
          <div class="tenant-badge">{$tenantConfig?.displayName?.slice(0, 1) ?? 'S'}</div>
        {/if}
        {#if !showDefaultWordmark}
        <div>
          <div class="tenant-name">{$tenantConfig?.displayName ?? 'Sent Tech'}</div>
          <div class="tenant-subtitle">
            {activeBranding?.subtitle ?? (activeTenantSlug === DEFAULT_TENANT_SLUG ? 'Studio CV Sent Tech' : `/${activeTenantSlug}`)}
          </div>
        </div>
        {/if}
      </a>

      {#if isDefaultLanding}
        <nav class="tenant-nav" aria-label="Navigation Sent Tech">
          {#each sentTechNavLinks as link}
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              class="tenant-nav-link"
            >
              {link.label}
            </a>
          {/each}
        </nav>
      {:else if loadingTenant}
        <span class="tenant-loading">Chargement...</span>
      {/if}
    </div>
  </header>

  {#if $tenantLoadError}
    <div class="tenant-error">
      {$tenantLoadError}
    </div>
  {/if}

  <main class="flex-1 bg-white">
    {@render children()}
  </main>

  <footer style="background: var(--color-purple-dark); padding-top: 2.25rem; padding-bottom: 2.25rem;">
    <div class="max-w-[1216px] mx-auto px-4 flex items-center justify-between gap-4">
      <div>
        <div class="tenant-name text-white/75">{$tenantConfig?.displayName ?? 'Sent Tech'}</div>
        <div class="tenant-subtitle text-white/40">{$tenantConfig?.brandUrl ?? 'https://www.sent-tech.ca/'}</div>
      </div>
      <p class="text-white/40 text-xs" style="font-family: var(--font-body);">
        Données chiffrées AES-256, purgées sous 48h
      </p>
    </div>
  </footer>
</div>

<style>
  header {
    position: relative;
    z-index: 20;
  }

  .tenant-header--overlay {
    position: absolute;
    inset: 0 0 auto 0;
    background: transparent;
  }

  .tenant-header-row--overlay {
    min-height: 6.25rem;
  }

  .tenant-badge {
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 0.85rem;
  }

  .tenant-logo {
    width: 2.5rem;
    height: 2.5rem;
    object-fit: contain;
    flex-shrink: 0;
  }

  .tenant-logo--wordmark {
    width: auto;
    height: 2.9rem;
    max-width: min(14rem, 48vw);
  }

  .tenant-logo--landing {
    height: 3.35rem;
    max-width: min(15rem, 54vw);
  }

  .tenant-logo--inverted {
    filter: brightness(0) invert(1);
  }

  .tenant-name {
    color: white;
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.1;
  }

  .tenant-subtitle {
    color: rgba(255, 255, 255, 0.5);
    font-family: var(--font-body);
    font-size: 0.75rem;
    line-height: 1.2;
    margin-top: 0.15rem;
  }

  .tenant-nav {
    display: none;
    align-items: center;
    gap: 2rem;
  }

  .tenant-nav-link {
    color: rgba(255, 255, 255, 0.92);
    font-family: var(--font-body);
    font-size: 0.95rem;
    font-weight: 500;
    text-decoration: none;
    transition: color 160ms ease;
  }

  .tenant-nav-link:hover {
    color: var(--color-green);
  }

  .tenant-loading {
    color: rgba(255, 255, 255, 0.6);
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .tenant-error {
    background: #fff7ed;
    color: #c2410c;
    border-bottom: 1px solid #fed7aa;
    padding: 0.65rem 1rem;
    font-size: 0.8rem;
    text-align: center;
  }

  @media (min-width: 900px) {
    .tenant-nav {
      display: flex;
    }
  }
</style>
