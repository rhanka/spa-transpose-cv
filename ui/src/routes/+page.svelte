<script lang="ts">
  import { goto } from '$app/navigation';
  import { createSession, uploadFiles, markReady, startProcessing } from '$lib/api';
  import { sessionId, sessionPassword } from '$lib/stores/session';

  let files = $state<File[]>([]);
  let password = $state('');
  let prompt = $state('');
  let loading = $state(false);
  let error = $state('');
  let dragOver = $state(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const dropped = Array.from(e.dataTransfer?.files || []);
    const valid = dropped.filter(f =>
      f.name.match(/\.(pdf|docx?|doc)$/i)
    );
    files = [...files, ...valid];
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      files = [...files, ...Array.from(input.files)];
    }
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
  }

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
      // 1. Create session
      const { sessionId: sid } = await createSession(password);

      // 2. Upload files
      await uploadFiles(sid, password, files);

      // 3. Mark ready with prompt
      await markReady(sid, password, prompt);

      // 4. Start processing
      await startProcessing(sid, password);

      // 5. Navigate to session page
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

<div class="max-w-[1248px] mx-auto px-4 py-16">
  <!-- Hero -->
  <section class="text-center mb-16">
    <h1 class="text-4xl md:text-5xl mb-4" style="color: var(--color-purple-dark);">
      Convertissez vos CVs au format Scalian
    </h1>
    <p class="text-lg max-w-2xl mx-auto" style="color: var(--color-purple-light);">
      Uploadez un lot de CVs, ajoutez un prompt d'orientation, et laissez l'IA transformer
      chaque profil au format Scalian en parallèle.
    </p>
  </section>

  <!-- Upload card -->
  <section class="max-w-2xl mx-auto">
    <div class="border-2 p-8 bg-white" style="border-color: var(--color-purple-border); box-shadow: 0 20px 40px 0 rgba(29, 17, 72, 0.1);">
      <!-- File drop zone -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="border-2 border-dashed p-12 text-center mb-6 transition-colors cursor-pointer"
        class:border-scalian-green={dragOver}
        style="border-color: {dragOver ? 'var(--color-green)' : 'var(--color-purple-border)'};"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        onclick={() => document.getElementById('file-input')?.click()}
        role="button"
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('file-input')?.click(); }}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.docx,.doc"
          class="hidden"
          onchange={handleFileSelect}
        />
        {#if files.length === 0}
          <p style="color: var(--color-purple-light);" class="mb-2">
            Glissez vos fichiers ici ou cliquez pour sélectionner
          </p>
          <p class="text-xs" style="color: var(--color-purple-light); opacity: 0.6;">
            PDF, DOCX, DOC — 50 Mo max au total
          </p>
        {:else}
          <p class="text-sm font-medium mb-3">{files.length} fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''}</p>
          <div class="text-left max-h-48 overflow-y-auto space-y-1">
            {#each files as file, i}
              <div class="flex items-center justify-between text-sm py-1 px-2 bg-gray-50">
                <span class="truncate flex-1">{file.name}</span>
                <span class="text-xs mx-2" style="color: var(--color-purple-light);">{formatSize(file.size)}</span>
                <button
                  class="text-red-400 hover:text-red-600 text-xs font-bold"
                  onclick={(e) => { e.stopPropagation(); removeFile(i); }}
                >✕</button>
              </div>
            {/each}
          </div>
          <p class="text-xs mt-2" style="color: var(--color-purple-light); opacity: 0.6;">
            Cliquez ou glissez pour ajouter d'autres fichiers
          </p>
        {/if}
      </div>

      <!-- Password -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-2" for="password">
          Mot de passe de chiffrement
        </label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Choisissez un mot de passe pour protéger cette session"
          class="w-full px-4 py-3 border-2 focus:outline-none text-sm"
          style="border-color: var(--color-purple-border);"
          onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'var(--color-purple)'}
          onblur={(e) => (e.target as HTMLElement).style.borderColor = 'var(--color-purple-border)'}
        />
        <p class="text-xs mt-1" style="color: var(--color-purple-light); opacity: 0.6;">
          Nécessaire pour accéder aux résultats. Communiquez-le au destinataire du lien.
        </p>
      </div>

      <!-- Prompt -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-2" for="prompt">
          Prompt d'orientation <span style="color: var(--color-purple-light); opacity: 0.6;" class="font-normal">(optionnel)</span>
        </label>
        <textarea
          id="prompt"
          rows={3}
          bind:value={prompt}
          placeholder="Ex: Focus cloud/DevOps, profils anglais, consolider les postes > 20 ans..."
          class="w-full px-4 py-3 border-2 focus:outline-none text-sm resize-none"
          style="border-color: var(--color-purple-border);"
          onfocus={(e) => (e.target as HTMLElement).style.borderColor = 'var(--color-purple)'}
          onblur={(e) => (e.target as HTMLElement).style.borderColor = 'var(--color-purple-border)'}
        ></textarea>
      </div>

      <!-- Error -->
      {#if error}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      {/if}

      <!-- Submit -->
      <button
        onclick={handleSubmit}
        disabled={!files.length || !password || loading}
        class="w-full py-4 text-sm font-semibold text-white border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style="border-color: var(--color-green); background: var(--color-green); transition-timing-function: var(--ease-smooth);"
        onmouseenter={(e) => { if (!loading) (e.target as HTMLElement).style.background = 'var(--color-green-hover)'; }}
        onmouseleave={(e) => (e.target as HTMLElement).style.background = 'var(--color-green)'}
      >
        {#if loading}
          Traitement en cours...
        {:else}
          Lancer la conversion
        {/if}
      </button>
    </div>
  </section>
</div>
