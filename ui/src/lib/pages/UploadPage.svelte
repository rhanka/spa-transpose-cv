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
  import { FileUploader } from '@sentropic/design-system-svelte';

  const ACCEPTED_CV_EXTENSIONS = /\.(pdf|docx?|doc)$/i;
  const CV_ACCEPT =
    '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  let files = $state<File[]>([]);
  let password = $state('');
  let prompt = $state('');
  let selectedProvider = $state('');
  let pageMode = $state<'optimizer' | 'builder'>('builder');
  let loading = $state(false);
  let error = $state('');

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

  function handleFiles(next: File[]) {
    // The FileUploader accepts attribute filters the picker but the drop
    // target is permissive, so re-apply the extension allow-list here.
    files = next.filter((file) => ACCEPTED_CV_EXTENSIONS.test(file.name));
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
      <div class="mb-6">
        <FileUploader
          id="file-input"
          class="upload-file-uploader"
          accept={CV_ACCEPT}
          multiple={true}
          bind:files
          onfiles={handleFiles}
          triggerLabel="Sélectionner des fichiers"
          dropzoneLabel="Glissez vos CV ici ou cliquez pour sélectionner"
          removeLabel={(name: string) => `Retirer ${name}`}
          helperText="PDF, DOCX, DOC — 50 Mo max au total"
        />
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

  :global(.upload-file-uploader) {
    max-width: 100%;
  }
</style>
