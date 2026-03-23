<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import {
    subscribeStatus,
    getResults,
    downloadFile,
    type FileStatus,
    type SessionStatus,
  } from '$lib/api';
  import {
    sessionPassword,
    sessionStatus,
    sessionFiles,
    sessionExpiresAt,
    sessionOutputs,
  } from '$lib/stores/session';

  const id = $derived($page.params.id ?? '');

  let password = $state('');
  let authenticated = $state(false);
  let status = $state('');
  let files = $state<FileStatus[]>([]);
  let expiresAt = $state('');
  let outputs = $state<string[]>([]);
  let eventSource: EventSource | null = null;
  let error = $state('');

  // If password was set from upload flow, use it
  $effect(() => {
    const storedPwd = $sessionPassword;
    if (storedPwd) {
      password = storedPwd;
      authenticated = true;
    }
  });

  onMount(() => {
    if (authenticated) startListening();
  });

  onDestroy(() => {
    eventSource?.close();
  });

  function authenticate() {
    if (!password) return;
    sessionPassword.set(password);
    authenticated = true;
    startListening();
  }

  function startListening() {
    eventSource = subscribeStatus(id, (data: SessionStatus) => {
      status = data.status;
      files = data.files;
      expiresAt = data.expiresAt;
      sessionStatus.set(data.status);
      sessionFiles.set(data.files);
      sessionExpiresAt.set(data.expiresAt);

      if (data.status === 'done' || data.status === 'error') {
        eventSource?.close();
        loadResults();
      }
    });
  }

  async function loadResults() {
    try {
      const res = await getResults(id);
      outputs = res.outputs;
      sessionOutputs.set(res.outputs);
    } catch {
      // ignore
    }
  }

  async function handleDownload(fileName: string) {
    try {
      const blob = await downloadFile(id, password, fileName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      error = `Erreur de téléchargement : ${(err as Error).message}`;
    }
  }

  function statusIcon(s: string): string {
    switch (s) {
      case 'done': return '✓';
      case 'error': return '✗';
      case 'processing': return '⟳';
      default: return '○';
    }
  }

  function statusColor(s: string): string {
    switch (s) {
      case 'done': return 'var(--color-green)';
      case 'error': return '#ef4444';
      case 'processing': return 'var(--color-purple)';
      default: return 'var(--color-purple-light)';
    }
  }

  function formatExpiry(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  $effect(() => {
    const doneCount = files.filter(f => f.status === 'done' || f.status === 'error').length;
    const total = files.length;
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    // Update derived values
    void pct;
  });
</script>

<div class="max-w-[1248px] mx-auto px-4 py-12">
  <div class="flex items-center justify-between mb-8">
    <h2 class="text-2xl" style="font-family: 'Poppins', sans-serif;">Session</h2>
    <code class="text-xs px-3 py-1 bg-gray-100" style="color: var(--color-purple-light);">{id}</code>
  </div>

  {#if !authenticated}
    <!-- Password gate -->
    <section class="max-w-md mx-auto">
      <div class="border-2 p-8 bg-white" style="border-color: var(--color-purple-border); box-shadow: 0 20px 40px 0 rgba(29, 17, 72, 0.1);">
        <label class="block text-sm font-medium mb-2" for="session-password">
          Mot de passe de la session
        </label>
        <input
          id="session-password"
          type="password"
          bind:value={password}
          placeholder="Entrez le mot de passe"
          class="w-full px-4 py-3 border-2 focus:outline-none text-sm mb-4"
          style="border-color: var(--color-purple-border);"
          onkeydown={(e) => { if (e.key === 'Enter') authenticate(); }}
        />
        <button
          onclick={authenticate}
          class="w-full py-3 text-sm font-semibold text-white border-2 transition-all"
          style="border-color: var(--color-green); background: var(--color-green);"
        >
          Accéder
        </button>
      </div>
    </section>
  {:else}
    <!-- Progress bar -->
    {#if files.length > 0}
      {@const doneCount = files.filter(f => f.status === 'done' || f.status === 'error').length}
      {@const pct = Math.round((doneCount / files.length) * 100)}
      <div class="mb-8">
        <div class="flex justify-between text-sm mb-2">
          <span>{doneCount}/{files.length} traité{doneCount > 1 ? 's' : ''}</span>
          <span class="font-semibold">{pct}%</span>
        </div>
        <div class="w-full h-2 bg-gray-100 overflow-hidden">
          <div
            class="h-full transition-all duration-500"
            style="width: {pct}%; background: {status === 'error' ? '#ef4444' : 'var(--color-green)'};"
          ></div>
        </div>
      </div>
    {/if}

    <!-- File list -->
    <div class="space-y-2 mb-8">
      {#each files as file}
        <div class="flex items-center gap-3 p-3 border bg-white" style="border-color: var(--color-purple-border);">
          <span class="text-lg" style="color: {statusColor(file.status)};">{statusIcon(file.status)}</span>
          <span class="flex-1 text-sm truncate">{file.name}</span>
          <span class="text-xs px-2 py-1" style="color: {statusColor(file.status)};">
            {file.status === 'processing' ? 'En cours...' : file.status === 'done' ? 'Terminé' : file.status === 'error' ? 'Erreur' : 'En attente'}
          </span>
          {#if file.status === 'done' && file.output}
            <button
              onclick={() => handleDownload(file.output!)}
              class="text-xs px-3 py-1 font-semibold text-white"
              style="background: var(--color-green);"
            >
              Télécharger
            </button>
          {/if}
          {#if file.status === 'error' && file.error}
            <span class="text-xs text-red-500 max-w-48 truncate" title={file.error}>{file.error}</span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Results section -->
    {#if status === 'done' || status === 'error'}
      <div class="border-2 p-6 bg-white mb-8" style="border-color: var(--color-purple-border);">
        <h3 class="text-lg font-semibold mb-4" style="font-family: 'Poppins', sans-serif;">Résultats</h3>

        {#if outputs.length > 0}
          <div class="space-y-2 mb-4">
            {#each outputs as output}
              <div class="flex items-center justify-between p-2 bg-gray-50">
                <span class="text-sm truncate">{output}</span>
                <button
                  onclick={() => handleDownload(output)}
                  class="text-xs px-3 py-1 font-semibold text-white"
                  style="background: var(--color-green);"
                >
                  Télécharger
                </button>
              </div>
            {/each}
          </div>
        {/if}

        {#if expiresAt}
          <p class="text-xs mt-4" style="color: var(--color-purple-light);">
            Ces fichiers seront supprimés le {formatExpiry(expiresAt)}
          </p>
        {/if}
      </div>

      <!-- Share link -->
      <div class="border-2 p-4 bg-gray-50" style="border-color: var(--color-purple-border);">
        <p class="text-sm font-medium mb-2">Partager cette session</p>
        <div class="flex items-center gap-2">
          <input
            readonly
            value={`${window.location.origin}/session/${id}`}
            class="flex-1 px-3 py-2 text-xs bg-white border"
            style="border-color: var(--color-purple-border);"
          />
          <button
            onclick={() => navigator.clipboard.writeText(`${window.location.origin}/session/${id}`)}
            class="px-3 py-2 text-xs font-semibold border-2"
            style="border-color: var(--color-purple); color: var(--color-purple);"
          >
            Copier
          </button>
        </div>
        <p class="text-xs mt-2" style="color: var(--color-purple-light); opacity: 0.6;">
          Le destinataire aura besoin du mot de passe pour déchiffrer les résultats.
        </p>
      </div>
    {/if}

    {#if error}
      <div class="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
        {error}
      </div>
    {/if}
  {/if}
</div>
