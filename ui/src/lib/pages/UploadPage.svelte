<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createSession, uploadFiles, markReady, startProcessing } from '$lib/api';
  import type { TemplateRenderer } from '$lib/api';
  import TenantBuilderForm from '$lib/components/TenantBuilderForm.svelte';
  import { sessionId, sessionPassword } from '$lib/stores/session';
  import { tenantConfig, tenantSlug } from '$lib/stores/tenant';
  import { buildTenantPath, DEFAULT_TENANT_SLUG } from '$lib/tenant';
  import ModelSelector from '$lib/components/ModelSelector.svelte';

  let files = $state<File[]>([]);
  let password = $state('');
  let prompt = $state('');
  let selectedProvider = $state('');
  let pageMode = $state<'optimizer' | 'builder'>('builder');
  let loading = $state(false);
  let error = $state('');
  let dragOver = $state(false);

  function getRendererOverride(value: string | null): TemplateRenderer | undefined {
    return value === 'generic' || value === 'legacy-scalian' ? value : undefined;
  }

  const currentTenantSlug = $derived($page.params.tenant ?? $tenantSlug);
  const currentTenantName = $derived($tenantConfig?.displayName ?? 'Sent Tech');
  const isDefaultTenant = $derived(currentTenantSlug === DEFAULT_TENANT_SLUG);
  const isScalianTenant = $derived(currentTenantSlug === 'scalian');
  const rendererOverride = $derived(getRendererOverride($page.url.searchParams.get('renderer')));
  const conversionTagline = "De 1h30 à 15 min par CV. Uploadez un lot, ajoutez un prompt d'orientation, et laissez l'IA transformer chaque profil en parallèle.";
  const pageTitle = $derived(
    isDefaultTenant && pageMode === 'builder'
      ? 'Créez un espace CV pour votre société'
      : isDefaultTenant
        ? 'Remettez votre CV en forme'
        : isScalianTenant
          ? 'Convertissez vos CVs au format Scalian'
          : `Mettez vos CV au format ${currentTenantName}`,
  );
  const pageCopy = $derived(
    isDefaultTenant && pageMode === 'builder'
      ? conversionTagline
      : isDefaultTenant
        ? 'Déposez un ou plusieurs CV, ajoutez vos consignes, puis laissez le service préparer une version propre et cohérente au format société.'
        : isScalianTenant
          ? conversionTagline
          : `Déposez un ou plusieurs CV, ajoutez vos consignes, puis laissez le service les remettre au format ${currentTenantName}.`,
  );
  const heroSectionPadding = $derived(isDefaultTenant ? 'padding: 8.5rem 0 4rem;' : 'padding: 5rem 0 4rem;');

  $effect(() => {
    if (!isDefaultTenant && pageMode !== 'optimizer') {
      pageMode = 'optimizer';
    }
  });

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const dropped = Array.from(e.dataTransfer?.files || []);
    files = [...files, ...dropped.filter((f) => f.name.match(/\.(pdf|docx?|doc)$/i))];
  }

  function handleDragOver(e: DragEvent) { e.preventDefault(); dragOver = true; }
  function handleDragLeave() { dragOver = false; }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) files = [...files, ...Array.from(input.files)];
  }

  function removeFile(index: number) { files = files.filter((_, i) => i !== index); }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  async function handleSubmit() {
    if (!files.length || !password) return;
    loading = true;
    error = '';
    try {
      const { sessionId: sid } = await createSession(password, currentTenantSlug, {
        renderer: rendererOverride,
      });
      await uploadFiles(sid, password, files, currentTenantSlug);
      await markReady(
        sid,
        password,
        prompt,
        {
          provider: selectedProvider || undefined,
        },
        currentTenantSlug,
      );
      await startProcessing(sid, password, currentTenantSlug);
      sessionId.set(sid);
      sessionPassword.set(password);
      goto(buildTenantPath(currentTenantSlug, `/session/${sid}`));
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }
</script>

<section
  class="text-white"
  style={`background: var(--tenant-hero-bg, var(--tenant-shell-bg, var(--color-purple-dark))); ${heroSectionPadding}`}
>
  <div class="max-w-[1216px] mx-auto px-4 text-center">
    {#if isDefaultTenant}
      <div class="mode-switch">
        <button
          type="button"
          class:active={pageMode === 'builder'}
          class="mode-chip"
          onclick={() => { pageMode = 'builder'; }}
        >
          Créer un espace société
        </button>
        <button
          type="button"
          class:active={pageMode === 'optimizer'}
          class="mode-chip"
          onclick={() => { pageMode = 'optimizer'; }}
        >
          Mettre un CV en forme
        </button>
      </div>
    {/if}
    <h1 class="text-4xl md:text-5xl mb-5" style="color: white; line-height: 1.2;">
      {pageTitle}
    </h1>
    <p class="text-lg max-w-2xl mx-auto" style="color: rgba(255,255,255,0.7); font-weight: 300;">
      {pageCopy}
    </p>
  </div>
</section>

<section class="bg-white" style="padding: 3rem 0 5rem; margin-top: -2rem;">
  <div class="mx-auto px-4 max-w-2xl">
    {#if isDefaultTenant && pageMode === 'builder'}
      <TenantBuilderForm />
    {:else}
    <div class="card p-8">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="border-2 border-dashed p-10 text-center mb-6 transition-colors cursor-pointer"
        style="border-color: {dragOver ? 'var(--color-green)' : 'var(--color-purple-border)'};"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        onclick={() => document.getElementById('file-input')?.click()}
        role="button"
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('file-input')?.click(); }}
      >
        <input id="file-input" type="file" multiple accept=".pdf,.docx,.doc" class="hidden" onchange={handleFileSelect} />
        {#if files.length === 0}
          <div class="mb-3">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-purple-lighter)" stroke-width="1.5" class="mx-auto">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
          </div>
          <p class="text-sm" style="color: var(--color-purple-light);">Glissez vos fichiers ici ou cliquez pour sélectionner</p>
          <p class="text-xs mt-1" style="color: var(--color-purple-lighter);">PDF, DOCX, DOC — 50 Mo max au total</p>
        {:else}
          <p class="text-sm font-semibold mb-3">{files.length} fichier{files.length > 1 ? 's' : ''}</p>
          <div class="text-left max-h-48 overflow-y-auto space-y-1">
            {#each files as file, i}
              <div class="flex items-center justify-between text-sm py-1.5 px-3" style="background: var(--color-purple-bg);">
                <span class="truncate flex-1">{file.name}</span>
                <span class="text-xs mx-3" style="color: var(--color-purple-lighter);">{formatSize(file.size)}</span>
                <button class="text-red-400 hover:text-red-600 text-xs font-bold" onclick={(e) => { e.stopPropagation(); removeFile(i); }}>&#x2715;</button>
              </div>
            {/each}
          </div>
          <p class="text-xs mt-2" style="color: var(--color-purple-lighter);">Cliquez ou glissez pour en ajouter</p>
        {/if}
      </div>

      <div class="mb-5">
        <label class="block text-sm font-medium mb-1.5" for="password">Mot de passe de chiffrement</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Choisissez un mot de passe pour cette session"
          class="w-full px-4 py-3 border-2 text-sm"
          style="border-color: var(--color-purple-border);"
        />
        <p class="text-xs mt-1" style="color: var(--color-purple-lighter);">
          Nécessaire pour déchiffrer les résultats. Communiquez-le au destinataire.
        </p>
      </div>

      <div class="mb-6">
        <label class="block text-sm font-medium mb-1.5" for="prompt">
          Consignes de conversion <span style="color: var(--color-purple-lighter);" class="font-normal">(optionnel)</span>
        </label>
        <textarea
          id="prompt"
          rows={3}
          bind:value={prompt}
          placeholder="Ex: garder les intitulés exacts, raccourcir les bullets trop longues, conserver le ton exécutif..."
          class="w-full px-4 py-3 border-2 text-sm resize-none"
          style="border-color: var(--color-purple-border);"
        ></textarea>
      </div>

      <ModelSelector bind:selected={selectedProvider} />

      {#if error}
        <div class="mb-4 p-3 text-sm" style="background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;">{error}</div>
      {/if}

      <button
        onclick={handleSubmit}
        disabled={!files.length || !password || loading}
        class="w-full btn-primary"
      >
        {loading ? 'Traitement en cours...' : 'Lancer la conversion'}
      </button>
    </div>
    {/if}
  </div>
</section>

<style>
  .mode-switch {
    display: inline-flex;
    gap: 0.55rem;
    padding: 0.35rem;
    margin-bottom: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .mode-chip {
    padding: 0.55rem 0.95rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(255, 255, 255, 0.76);
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    cursor: pointer;
  }

  .mode-chip.active {
    background: rgba(255, 255, 255, 0.16);
    color: white;
  }

  @media (max-width: 640px) {
    .mode-switch {
      display: flex;
      flex-direction: column;
      border-radius: calc(var(--radius-base) * 0.75);
    }
  }
</style>
