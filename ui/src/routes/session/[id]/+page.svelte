<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import { marked } from 'marked';
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

  // Per-file streaming state — reassign whole object for Svelte reactivity
  let fileStreams = $state<Record<number, {
    phase: string;
    thinking: string;
    elapsed_ms: number;
    parsed_keys: Record<string, unknown>;
    attention_cv: string;
    attention_trad: string;
    lastUpdate: number;
  }>>({});

  // Configure marked for inline rendering (no <p> wrapping)
  marked.setOptions({ breaks: true, gfm: true });

  $effect(() => {
    const storedPwd = $sessionPassword;
    if (storedPwd && !authenticated) {
      password = storedPwd;
      authenticated = true;
      startListening();
    }
  });

  onDestroy(() => { eventSource?.close(); });

  // Svelte action: auto-scroll via MutationObserver (pattern from top-ai-ideas)
  function scrollToEnd(node: HTMLElement) {
    const scroll = () => { try { node.scrollTop = node.scrollHeight; } catch { /* */ } };
    scroll();
    const obs = new MutationObserver(scroll);
    obs.observe(node, { childList: true, subtree: true, characterData: true });
    return { destroy() { obs.disconnect(); } };
  }

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
        const newThinking = prev.thinking + (ev.thinking_delta || '');
        // Reassign entire object to trigger Svelte reactivity on deep changes
        fileStreams = {
          ...fileStreams,
          [ev.fileIndex]: {
            phase: ev.phase || prev.phase,
            thinking: newThinking.length > 2000 ? '...' + newThinking.slice(-1500) : newThinking,
            elapsed_ms: ev.elapsed_ms ?? prev.elapsed_ms,
            parsed_keys: ev.parsed_keys ? { ...prev.parsed_keys, ...ev.parsed_keys } : prev.parsed_keys,
            attention_cv: ev.attention_cv || prev.attention_cv,
            attention_trad: ev.attention_trad || prev.attention_trad,
            lastUpdate: Date.now(),
          },
        };
      }
    });
  }

  async function loadResults() {
    try { const res = await getResults(id); outputs = res.outputs; } catch { /* */ }
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
    const map: Record<string, string> = {
      extracting_text: 'Extraction texte',
      calling_claude: 'Analyse IA',
      building_docx: 'Construction DOCX',
      validating: 'Validation QA',
      done: 'OK',
      error: 'Erreur',
    };
    return map[phase] || 'En attente';
  }

  function formatMs(ms: number): string { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(0)}s`; }
  function formatExpiry(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function isStalled(idx: number): boolean {
    const s = fileStreams[idx];
    return !!s && s.phase !== 'done' && s.phase !== 'error' && Date.now() - s.lastUpdate > 120_000;
  }

  function renderMd(md: string): string {
    if (!md || md === '—' || md === '— RAS') return '<span style="opacity:0.5">—</span>';
    return marked.parse(md) as string;
  }
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
    <!-- Progress -->
    {#if files.length > 0}
      {@const doneCount = files.filter(f => f.status === 'done' || f.status === 'error').length}
      {@const conductorDone = Object.values(fileStreams).filter(s => s.attention_trad && s.attention_trad !== '').length}
      {@const totalSteps = files.length * 2}
      {@const completedSteps = doneCount + conductorDone}
      {@const pct = Math.round((completedSteps / totalSteps) * 100)}
      <div class="mb-6">
        <div class="flex justify-between text-xs mb-1">
          <span>{doneCount}/{files.length} profils + {conductorDone}/{doneCount || 0} validations</span>
          <span class="font-semibold">{pct}%</span>
        </div>
        <div class="w-full h-1.5 bg-gray-100"><div class="h-full transition-all duration-500" style="width: {pct}%; background: var(--color-green);"></div></div>
      </div>
    {/if}

    <!-- Grid per CV -->
    <div class="space-y-3 mb-8">
      {#each files as file, idx}
        {@const stream = fileStreams[idx]}
        {@const isDone = file.status === 'done'}
        {@const isError = file.status === 'error'}
        {@const isProcessing = file.status === 'processing'}

        {#if isDone}
          <!-- RESULT: 4-column grid -->
          <div class="card result-grid">
            <div class="p-3 border-r" style="border-color: var(--color-purple-border);">
              <div class="col-label">Source</div>
              <div class="text-sm truncate" title={file.name}>{file.name}</div>
            </div>
            <div class="p-3 border-r" style="border-color: var(--color-purple-border); min-width: 0;">
              <div class="col-label">DOCX</div>
              {#if file.output}
                <button onclick={() => handleDownload(file.output!)} class="text-sm font-semibold block truncate max-w-full" style="color: var(--color-green); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title={file.output}>{file.output}</button>
              {/if}
            </div>
            <div class="p-3 border-r attention-cell" style="border-color: var(--color-purple-border);">
              <div class="col-label">Attention CV</div>
              <div class="attention-content">{@html renderMd(stream?.attention_cv || '')}</div>
            </div>
            <div class="p-3 attention-cell">
              <div class="col-label">Attention trad</div>
              {#if stream?.attention_trad}
                <div class="attention-content">{@html renderMd(stream.attention_trad)}</div>
              {:else}
                <div class="text-xs animate-pulse" style="color: var(--color-purple-lighter);">Analyse conductor en cours...</div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- STREAMING: 2-column grid, fixed height -->
          <div class="card stream-grid">
            <div class="p-3 border-r flex flex-col" style="border-color: var(--color-purple-border);">
              <div class="text-sm font-medium truncate mb-2">{file.name}</div>
              {#if isError}
                <span class="text-xs px-2 py-0.5 inline-block" style="background: #fef2f2; color: #b91c1c;">Erreur</span>
                {#if file.error}<div class="text-xs mt-1" style="color: #b91c1c;">{file.error}</div>{/if}
              {:else if isProcessing && stream}
                <div class="flex items-center gap-2 text-xs" style="color: var(--color-purple);">
                  <span class="animate-pulse">&#9711;</span>
                  <span class="font-medium">{phaseLabel(stream.phase)}</span>
                  <span style="color: var(--color-purple-lighter);">({formatMs(stream.elapsed_ms)})</span>
                </div>
                {#if isStalled(idx)}
                  <div class="text-xs mt-1" style="color: #d97706;">Possible blocage (&gt;2min)</div>
                {/if}
                {#if stream.parsed_keys?.name}
                  <div class="text-xs mt-2" style="color: var(--color-purple-light);">Candidat : {stream.parsed_keys.name}</div>
                {/if}
              {:else}
                <span class="text-xs" style="color: var(--color-purple-lighter);">En attente</span>
              {/if}
            </div>
            <div class="stream-panel" use:scrollToEnd>
              {#if stream?.thinking}
                <pre class="stream-text">{stream.thinking}</pre>
              {:else if !isProcessing}
                <div class="text-xs" style="color: var(--color-purple-lighter); padding: 0.75rem;">En attente...</div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Batch results: ZIP only -->
    {#if sessionStatus === 'done' || sessionStatus === 'error'}
      <div class="card p-6 mb-6">
        <h3 class="text-lg font-semibold mb-4">Téléchargements</h3>
        {#each outputs.filter(o => o.endsWith('.zip')) as zipFile}
          <div class="flex items-center justify-between p-3" style="background: var(--color-purple-bg);">
            <div>
              <span class="text-sm font-semibold">Tous les profils (ZIP)</span>
              <span class="text-xs ml-2" style="color: var(--color-purple-lighter);">{zipFile}</span>
            </div>
            <button onclick={() => handleDownload(zipFile)} class="btn-primary text-xs py-2 px-4">Télécharger</button>
          </div>
        {/each}
        {#if expiresAt}
          <p class="text-xs mt-4" style="color: var(--color-purple-lighter);">Suppression le {formatExpiry(expiresAt)}</p>
        {/if}
      </div>

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
  .col-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-purple-lighter);
    margin-bottom: 0.25rem;
  }

  .result-grid {
    display: grid;
    grid-template-columns: 25% 25% 25% 25%;
    gap: 0;
  }

  .result-grid > div,
  .stream-grid > div {
    min-width: 0;
  }

  .stream-grid {
    display: grid;
    grid-template-columns: 33.33% 66.67%;
    gap: 0;
  }

  .stream-panel {
    height: 160px;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .stream-text {
    font-size: 0.75rem;
    font-family: monospace;
    white-space: pre-wrap;
    color: var(--color-purple-light);
    opacity: 0.65;
    margin: 0;
  }

  /* Fixed height attention cells with overflow */
  .attention-cell {
    height: 160px;
    overflow-y: auto;
  }

  .attention-content {
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--color-purple-light);
  }

  .attention-content :global(ul) {
    padding-left: 1rem;
    margin: 0;
  }

  .attention-content :global(li) {
    margin-bottom: 0.25rem;
  }

  .attention-content :global(p) {
    margin: 0 0 0.25rem 0;
  }

  .attention-content :global(strong) {
    color: var(--color-purple-dark);
  }

  @media (max-width: 768px) {
    .result-grid, .stream-grid {
      grid-template-columns: 1fr !important;
    }
    .stream-panel, .attention-cell {
      height: 120px;
    }
  }
</style>
