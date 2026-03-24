<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import {
    subscribeStatus,
    getResults,
    downloadFile,
    type FileStatus,
    type SseData,
    type StreamEvent,
  } from '$lib/api';
  import { sessionPassword } from '$lib/stores/session';

  const id = $derived($page.params.id ?? '');

  let password = $state('');
  let authenticated = $state(false);
  let sessionStatus = $state('');
  let files = $state<FileStatus[]>([]);
  let expiresAt = $state('');
  let outputs = $state<string[]>([]);
  let eventSource: EventSource | null = null;
  let error = $state('');

  // Per-file streaming state
  let fileStreams = $state<Record<number, {
    phase: string;
    thinking: string;
    elapsed_ms: number;
    parsed_keys: Record<string, unknown>;
    attention_cv: string;
    attention_trad: string;
    lastUpdate: number;
  }>>({});

  $effect(() => {
    const storedPwd = $sessionPassword;
    if (storedPwd) {
      password = storedPwd;
      authenticated = true;
      startListening();
    }
  });

  onDestroy(() => { eventSource?.close(); });

  function authenticate() {
    if (!password) return;
    sessionPassword.set(password);
    authenticated = true;
    startListening();
  }

  function startListening() {
    eventSource = subscribeStatus(id, (data: SseData) => {
      if (data.type === 'status') {
        sessionStatus = data.status;
        files = data.files;
        expiresAt = data.expiresAt;
        if (data.status === 'done' || data.status === 'error') {
          eventSource?.close();
          loadResults();
        }
      } else if (data.type === 'stream') {
        const ev = data as StreamEvent;
        const prev = fileStreams[ev.fileIndex] || { phase: '', thinking: '', elapsed_ms: 0, parsed_keys: {}, attention_cv: '', attention_trad: '', lastUpdate: Date.now() };
        fileStreams[ev.fileIndex] = {
          phase: ev.phase || prev.phase,
          thinking: prev.thinking + (ev.thinking_delta || ''),
          elapsed_ms: ev.elapsed_ms ?? prev.elapsed_ms,
          parsed_keys: ev.parsed_keys ? { ...prev.parsed_keys, ...ev.parsed_keys } : prev.parsed_keys,
          attention_cv: ev.attention_cv || prev.attention_cv,
          attention_trad: ev.attention_trad || prev.attention_trad,
          lastUpdate: Date.now(),
        };
        // Keep thinking buffer manageable
        if (fileStreams[ev.fileIndex].thinking.length > 2000) {
          fileStreams[ev.fileIndex].thinking = '...' + fileStreams[ev.fileIndex].thinking.slice(-1500);
        }
      }
    });
  }

  async function loadResults() {
    try {
      const res = await getResults(id);
      outputs = res.outputs;
    } catch { /* ignore */ }
  }

  async function handleDownload(fileName: string) {
    try {
      const blob = await downloadFile(id, password, fileName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { error = (err as Error).message; }
  }

  function phaseLabel(phase: string): string {
    switch (phase) {
      case 'extracting_text': return 'Extraction texte';
      case 'calling_claude': return 'Analyse IA';
      case 'building_docx': return 'Génération DOCX';
      case 'validating': return 'Validation';
      case 'done': return 'Terminé';
      case 'error': return 'Erreur';
      default: return 'En attente';
    }
  }

  function formatMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(0)}s`;
  }

  function formatExpiry(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function isStalled(fileIndex: number): boolean {
    const s = fileStreams[fileIndex];
    if (!s || s.phase === 'done' || s.phase === 'error') return false;
    return Date.now() - s.lastUpdate > 120_000;
  }

  $effect(() => { void files; }); // reactive trigger
</script>

<div class="max-w-[1216px] mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl">Session</h2>
    <code class="text-xs px-3 py-1" style="background: var(--color-purple-bg); color: var(--color-purple-light);">{id}</code>
  </div>

  {#if !authenticated}
    <section class="max-w-md mx-auto">
      <div class="card p-8">
        <label class="block text-sm font-medium mb-1.5" for="sp">Mot de passe</label>
        <input id="sp" type="password" bind:value={password} placeholder="Mot de passe de la session"
          class="w-full px-4 py-3 border-2 text-sm mb-4" style="border-color: var(--color-purple-border);"
          onkeydown={(e) => { if (e.key === 'Enter') authenticate(); }} />
        <button onclick={authenticate} class="w-full btn-primary">Accéder</button>
      </div>
    </section>
  {:else}
    <!-- Progress bar -->
    {#if files.length > 0}
      {@const doneCount = files.filter(f => f.status === 'done' || f.status === 'error').length}
      {@const pct = Math.round((doneCount / files.length) * 100)}
      <div class="mb-6">
        <div class="flex justify-between text-sm mb-1">
          <span>{doneCount}/{files.length} traité{doneCount > 1 ? 's' : ''}</span>
          <span class="font-semibold">{pct}%</span>
        </div>
        <div class="w-full h-1.5 bg-gray-100"><div class="h-full transition-all duration-500" style="width: {pct}%; background: var(--color-green);"></div></div>
      </div>
    {/if}

    <!-- Grid: face-à-face per CV -->
    <div class="space-y-3 mb-8">
      {#each files as file, idx}
        {@const stream = fileStreams[idx]}
        {@const isDone = file.status === 'done'}
        {@const isError = file.status === 'error'}
        {@const isProcessing = file.status === 'processing'}

        {#if isDone}
          <!-- RESULT MODE: 4 columns -->
          <div class="card p-0" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0;">
            <div class="p-4 border-r" style="border-color: var(--color-purple-border);">
              <div class="text-xs font-semibold mb-1 uppercase" style="color: var(--color-purple-lighter);">Source</div>
              <div class="text-sm truncate">{file.name}</div>
            </div>
            <div class="p-4 border-r" style="border-color: var(--color-purple-border);">
              <div class="text-xs font-semibold mb-1 uppercase" style="color: var(--color-purple-lighter);">DOCX</div>
              {#if file.output}
                <button onclick={() => handleDownload(file.output!)} class="text-sm font-semibold" style="color: var(--color-green);">{file.output}</button>
              {/if}
            </div>
            <div class="p-4 border-r" style="border-color: var(--color-purple-border);">
              <div class="text-xs font-semibold mb-1 uppercase" style="color: var(--color-purple-lighter);">Attention CV</div>
              <div class="text-xs" style="color: var(--color-purple-light);">{stream?.attention_cv || '—'}</div>
            </div>
            <div class="p-4">
              <div class="text-xs font-semibold mb-1 uppercase" style="color: var(--color-purple-lighter);">Attention trad</div>
              <div class="text-xs" style="color: var(--color-purple-light);">{stream?.attention_trad || '—'}</div>
            </div>
          </div>
        {:else}
          <!-- STREAMING MODE: 2 columns -->
          <div class="card p-0" style="display: grid; grid-template-columns: 1fr 2fr; gap: 0;">
            <div class="p-4 border-r" style="border-color: var(--color-purple-border);">
              <div class="text-sm font-medium truncate mb-2">{file.name}</div>
              {#if isError}
                <span class="text-xs px-2 py-0.5" style="background: #fef2f2; color: #b91c1c;">Erreur</span>
                {#if file.error}<div class="text-xs mt-1" style="color: #b91c1c;">{file.error}</div>{/if}
              {:else if isProcessing && stream}
                <div class="flex items-center gap-2 text-xs" style="color: var(--color-purple);">
                  <span class="animate-pulse">&#9711;</span>
                  <span>{phaseLabel(stream.phase)}</span>
                  <span style="color: var(--color-purple-lighter);">({formatMs(stream.elapsed_ms)})</span>
                </div>
                {#if isStalled(idx)}
                  <div class="text-xs mt-1" style="color: #d97706;">Possible blocage (&gt;2min sans activité)</div>
                {/if}
                {#if stream.parsed_keys?.name}
                  <div class="text-xs mt-1" style="color: var(--color-purple-light);">Candidat : {stream.parsed_keys.name}</div>
                {/if}
              {:else}
                <span class="text-xs" style="color: var(--color-purple-lighter);">En attente</span>
              {/if}
            </div>
            <div class="p-4 overflow-hidden" style="max-height: 200px;">
              {#if stream?.thinking}
                <div class="text-xs font-mono whitespace-pre-wrap overflow-y-auto" style="max-height: 180px; color: var(--color-purple-light); opacity: 0.7;">{stream.thinking}</div>
              {:else if !isProcessing}
                <div class="text-xs" style="color: var(--color-purple-lighter);">En attente de traitement...</div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Results section -->
    {#if sessionStatus === 'done' || sessionStatus === 'error'}
      <div class="card p-6 mb-6">
        <h3 class="text-lg font-semibold mb-4">Résultats</h3>
        {#if outputs.length > 0}
          <div class="space-y-2 mb-4">
            {#each outputs as output}
              <div class="flex items-center justify-between p-2" style="background: var(--color-purple-bg);">
                <span class="text-sm truncate">{output}</span>
                <button onclick={() => handleDownload(output)} class="btn-primary text-xs py-1 px-3">Télécharger</button>
              </div>
            {/each}
          </div>
        {/if}
        {#if expiresAt}
          <p class="text-xs" style="color: var(--color-purple-lighter);">Ces fichiers seront supprimés le {formatExpiry(expiresAt)}</p>
        {/if}
      </div>

      <!-- Share -->
      <div class="card p-4">
        <p class="text-sm font-medium mb-2">Partager cette session</p>
        <div class="flex items-center gap-2">
          <input readonly value={`${window.location.origin}/session/${id}`}
            class="flex-1 px-3 py-2 text-xs bg-white border" style="border-color: var(--color-purple-border);" />
          <button onclick={() => navigator.clipboard.writeText(`${window.location.origin}/session/${id}`)} class="btn-secondary text-xs py-2 px-3">Copier</button>
        </div>
        <p class="text-xs mt-2" style="color: var(--color-purple-lighter);">Le destinataire aura besoin du mot de passe.</p>
      </div>
    {/if}

    {#if error}
      <div class="mt-4 p-3 text-sm" style="background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;">{error}</div>
    {/if}
  {/if}
</div>

<style>
  @media (max-width: 768px) {
    :global(.card[style*="grid-template-columns: 1fr 1fr 1fr 1fr"]) {
      grid-template-columns: 1fr !important;
    }
    :global(.card[style*="grid-template-columns: 1fr 2fr"]) {
      grid-template-columns: 1fr !important;
    }
  }
</style>
