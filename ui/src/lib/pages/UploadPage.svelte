<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createSession, uploadFiles, markReady, startProcessing } from '$lib/api';
  import TenantBuilderForm from '$lib/components/TenantBuilderForm.svelte';
  import { sessionId, sessionPassword } from '$lib/stores/session';
  import { tenantConfig, tenantSlug } from '$lib/stores/tenant';
  import { buildTenantPath, DEFAULT_TENANT_SLUG } from '$lib/tenant';
  import ModelSelector from '$lib/components/ModelSelector.svelte';

  let files = $state<File[]>([]);
  let password = $state('');
  let prompt = $state('');
  let selectedProvider = $state('');
  let selectedTemplateVariant = $state('');
  let pageMode = $state<'optimizer' | 'builder'>('builder');
  let loading = $state(false);
  let error = $state('');
  let dragOver = $state(false);
  let previewModal = $state<{ src: string; alt: string } | null>(null);

  const currentTenantSlug = $derived($page.params.tenant ?? $tenantSlug);
  const currentTenantName = $derived($tenantConfig?.displayName ?? 'Sent Tech');
  const isDefaultTenant = $derived(currentTenantSlug === DEFAULT_TENANT_SLUG);
  const pageTitle = $derived(
    isDefaultTenant && pageMode === 'builder'
      ? 'Créez un espace CV pour une société'
      : isDefaultTenant
        ? 'Remettez votre CV en forme'
        : `Mettez vos CV au format ${currentTenantName}`,
  );
  const pageCopy = $derived(
    isDefaultTenant && pageMode === 'builder'
      ? "Construisez une page personnalisée à l'image de votre entreprise. Passez de 1h30 à 15 min pour vos nouvelles recrues."
      : isDefaultTenant
        ? 'Déposez un ou plusieurs CV, choisissez un style, puis laissez le service préparer une version propre, lisible et cohérente.'
        : `Déposez un ou plusieurs CV, ajoutez vos consignes, puis laissez le service les remettre au format ${currentTenantName}.`,
  );
  const heroSectionPadding = $derived(isDefaultTenant ? 'padding: 8.5rem 0 4rem;' : 'padding: 5rem 0 4rem;');
  const templateLibrary = $derived(
    isDefaultTenant && pageMode === 'optimizer' && $tenantConfig?.templateLibrary?.enabled
      ? $tenantConfig.templateLibrary
      : null,
  );

  $effect(() => {
    if (!isDefaultTenant && pageMode !== 'optimizer') {
      pageMode = 'optimizer';
    }
  });

  $effect(() => {
    if (!selectedTemplateVariant && templateLibrary?.defaultVariant) {
      selectedTemplateVariant = templateLibrary.defaultVariant;
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
      const { sessionId: sid } = await createSession(password, currentTenantSlug);
      await uploadFiles(sid, password, files, currentTenantSlug);
      await markReady(
        sid,
        password,
        prompt,
        {
          provider: selectedProvider || undefined,
          templateVariant: templateLibrary ? selectedTemplateVariant : undefined,
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
  <div class={`mx-auto px-4 ${templateLibrary ? 'max-w-5xl' : 'max-w-2xl'}`}>
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

      {#if templateLibrary}
        <div class="mb-6 template-library">
          <div class="mb-3">
            <h3 class="template-library-title">Bibliothèque BetterCV adaptée au DOCX</h3>
            <p class="template-library-copy">
              Chaque aperçu provient du moteur DOCX réel, généré sur un même profil de démonstration puis converti en image.
            </p>
          </div>

          <div class="template-library-grid">
            {#each templateLibrary.options as option}
              <div
                class:selected={selectedTemplateVariant === option.id}
                class="template-card"
              >
                <button
                  type="button"
                  class="template-preview-trigger"
                  aria-label={`Agrandir l aperçu ${option.referenceLabel ?? option.label}`}
                  onclick={() => {
                    if (option.previewImagePath) {
                      previewModal = {
                        src: option.previewImagePath,
                        alt: `Aperçu ${option.referenceLabel ?? option.label}`,
                      };
                    }
                  }}
                >
                  {#if option.previewImagePath}
                    <img
                      class="template-preview-image"
                      src={option.previewImagePath}
                      alt={`Aperçu ${option.referenceLabel ?? option.label}`}
                    />
                  {:else}
                    <div class="template-preview-fallback" aria-hidden="true"></div>
                  {/if}
                </button>
                <button
                  type="button"
                  class="template-card-select"
                  onclick={() => { selectedTemplateVariant = option.id; }}
                >
                  <span class="template-card-label">{option.label}</span>
                  {#if option.referenceLabel}
                    <span class="template-card-reference">{option.referenceLabel}</span>
                  {/if}
                  <span class="template-card-description">{option.description}</span>
                  {#if option.referenceSummary}
                    <span class="template-card-reference-copy">{option.referenceSummary}</span>
                  {/if}
                  {#if option.recommendedFor}
                    <span class="template-card-hint">{option.recommendedFor}</span>
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

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

{#if previewModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="preview-modal-backdrop"
    onclick={() => { previewModal = null; }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="preview-modal-body" onclick={(e) => e.stopPropagation()}>
      <button type="button" class="preview-modal-close" aria-label="Fermer l aperçu" onclick={() => { previewModal = null; }}>
        &#x2715;
      </button>
      <img class="preview-modal-image" src={previewModal.src} alt={previewModal.alt} />
    </div>
  </div>
{/if}

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

  .template-library {
    padding: 1.25rem;
    border: 1px solid var(--color-purple-border);
    border-radius: calc(var(--radius-base) * 0.85);
    background: linear-gradient(180deg, rgba(17, 196, 212, 0.04) 0%, rgba(255, 255, 255, 0.96) 100%);
  }

  .template-library-title {
    margin: 0;
    font-size: 1rem;
    color: var(--color-purple-dark);
  }

  .template-library-copy {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
    color: var(--color-purple-light);
  }

  .template-library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1rem;
  }

  .template-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.45rem;
    width: 100%;
    padding: 0.85rem;
    border: 1px solid var(--color-purple-border);
    border-radius: calc(var(--radius-base) * 0.75);
    background: rgba(255, 255, 255, 0.92);
    color: var(--color-purple-dark);
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    text-align: left;
  }

  .template-preview-trigger {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
    border-radius: calc(var(--radius-base) * 0.6);
  }

  .template-card-select {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .template-card:hover {
    transform: translateY(-1px);
    border-color: rgba(17, 196, 212, 0.55);
  }

  .template-card.selected {
    border-color: var(--color-green);
    box-shadow: 0 12px 28px rgba(17, 196, 212, 0.14);
  }

  .template-card-label {
    font-family: var(--font-heading);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .template-card-reference {
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-green);
    text-transform: uppercase;
  }

  .template-preview-image,
  .template-preview-fallback {
    width: 100%;
    height: 13rem;
    border: 1px solid rgba(19, 56, 108, 0.12);
    border-radius: calc(var(--radius-base) * 0.6);
    background: #f8fbff;
    overflow: hidden;
    transition: transform 0.18s ease, border-color 0.18s ease;
  }

  .template-preview-image {
    display: block;
    object-fit: cover;
    object-position: center top;
  }

  .template-preview-trigger:hover .template-preview-image,
  .template-preview-trigger:focus-visible .template-preview-image {
    transform: scale(1.02);
    border-color: rgba(17, 196, 212, 0.55);
  }

  .template-preview-fallback {
    background:
      linear-gradient(180deg, rgba(17, 196, 212, 0.08) 0%, rgba(255, 255, 255, 0.96) 100%);
  }

  .template-card-description {
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--color-purple-light);
  }

  .template-card-reference-copy {
    font-size: 0.76rem;
    line-height: 1.45;
    color: var(--color-purple-light);
  }

  .template-card-hint {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-green);
  }

  @media (max-width: 980px) {
    .template-library-grid {
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    }
  }

  @media (max-width: 640px) {
    .mode-switch {
      display: flex;
      flex-direction: column;
      border-radius: calc(var(--radius-base) * 0.75);
    }

    .template-library-grid {
      grid-template-columns: 1fr;
    }

    .template-preview-image,
    .template-preview-fallback {
      height: 16rem;
    }
  }

  .preview-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(12, 16, 32, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    z-index: 60;
    cursor: zoom-out;
  }

  .preview-modal-body {
    position: relative;
    max-width: min(90vw, 900px);
    max-height: 92vh;
    background: white;
    border-radius: calc(var(--radius-base) * 0.75);
    overflow: auto;
    cursor: default;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  }

  .preview-modal-image {
    display: block;
    width: 100%;
    height: auto;
    max-height: 92vh;
    object-fit: contain;
  }

  .preview-modal-close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 999px;
    background: rgba(12, 16, 32, 0.75);
    color: white;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    z-index: 1;
  }
</style>
