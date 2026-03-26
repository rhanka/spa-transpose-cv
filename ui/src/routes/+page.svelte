<script lang="ts">
  import { goto } from '$app/navigation';
  import { createSession, uploadFiles, markReady, startProcessing } from '$lib/api';
  import { sessionId, sessionPassword } from '$lib/stores/session';
  import ModelSelector from '$lib/components/ModelSelector.svelte';

  let files = $state<File[]>([]);
  let password = $state('');
  let prompt = $state('');
  let selectedProvider = $state('');
  let loading = $state(false);
  let error = $state('');
  let dragOver = $state(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const dropped = Array.from(e.dataTransfer?.files || []);
    files = [...files, ...dropped.filter(f => f.name.match(/\.(pdf|docx?|doc)$/i))];
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
      const { sessionId: sid } = await createSession(password);
      await uploadFiles(sid, password, files);
      await markReady(sid, password, prompt, selectedProvider || undefined);
      await startProcessing(sid, password);
      sessionId.set(sid);
      sessionPassword.set(password);
      goto(`/session/${sid}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }
</script>

<!-- Hero section — purple bg like scalian.com -->
<section class="bg-[#1D1148] text-white" style="padding: 5rem 0 4rem;">
  <div class="max-w-[1216px] mx-auto px-4 text-center">
    <h1 class="text-4xl md:text-5xl mb-5" style="color: white; line-height: 1.2;">
      Convertissez vos CVs<br/>au format Scalian
    </h1>
    <p class="text-lg max-w-2xl mx-auto" style="color: rgba(255,255,255,0.65); font-weight: 300;">
      Uploadez un lot de CVs, ajoutez un prompt d'orientation, et laissez l'IA
      transformer chaque profil en parall&egrave;le.
    </p>
  </div>
</section>

<!-- Upload card — floating on white bg -->
<section class="bg-white" style="padding: 3rem 0 5rem; margin-top: -2rem;">
  <div class="max-w-2xl mx-auto px-4">
    <div class="card p-8">
      <!-- File drop zone -->
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
          <p class="text-sm" style="color: var(--color-purple-light);">Glissez vos fichiers ici ou cliquez pour s&eacute;lectionner</p>
          <p class="text-xs mt-1" style="color: var(--color-purple-lighter);">PDF, DOCX, DOC &mdash; 50 Mo max au total</p>
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

      <!-- Password -->
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
          N&eacute;cessaire pour d&eacute;chiffrer les r&eacute;sultats. Communiquez-le au destinataire.
        </p>
      </div>

      <!-- Prompt -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-1.5" for="prompt">
          Prompt d'orientation <span style="color: var(--color-purple-lighter);" class="font-normal">(optionnel)</span>
        </label>
        <textarea
          id="prompt"
          rows={3}
          bind:value={prompt}
          placeholder="Ex: Focus cloud/DevOps, profils anglais, consolider les postes > 20 ans..."
          class="w-full px-4 py-3 border-2 text-sm resize-none"
          style="border-color: var(--color-purple-border);"
        ></textarea>
      </div>

      <!-- Model selector -->
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
  </div>
</section>
