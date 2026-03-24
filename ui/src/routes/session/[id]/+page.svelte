<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy, tick } from 'svelte';
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
    if (storedPwd) { password = storedPwd; authenticated = true; startListening(); }
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
        const newThinking = prev.thinking + (ev.thinking_delta || '');
        fileStreams[ev.fileIndex] = {
          phase: ev.phase || prev.phase,
          thinking: newThinking.length > 2000 ? '...' + newThinking.slice(-1500) : newThinking,
          elapsed_ms: ev.elapsed_ms ?? prev.elapsed_ms,
          parsed_keys: ev.parsed_keys ? { ...prev.parsed_keys, ...ev.parsed_keys } : prev.parsed_keys,
          attention_cv: ev.attention_cv || prev.attention_cv,
          attention_trad: ev.attention_trad || prev.attention_trad,
          lastUpdate: Date.now(),
        };
        tick().then(() => autoScroll(ev.fileIndex));
      }
    });
  }

  function autoScroll(idx: number) {
    const el = document.getElementById(`stream-${idx}`);
    if (el) el.scrollTop = el.scrollHeight;
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

  /** Simple markdown → HTML for attention columns (bullet points only) */
  function mdToHtml(md: string): string {
    if (!md || md === '—') return '<span style="opacity:0.5">—</span>';
    return md
      .replace(/^- /gm, '&bull; ')
      .replace(/\n/g, '<br/>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
            <div class="p-3 border-r" style="border-color: var(--color-purple-border);">
              <div class="col-label">DOCX</div>
              {#if file.output}
                <button onclick={() => handleDownload(file.output!)} class="text-sm font-semibold truncate block" style="color: var(--color-green);" title={file.output}>{file.output}</button>
              {/if}
            </div>
            <div class="p-3 border-r overflow-y-auto" style="border-color: var(--color-purple-border); max-height: 160px;">
              <div class="col-label">Attention CV</div>
              <div class="text-xs leading-relaxed" style="color: var(--color-purple-light);">{@html mdToHtml(stream?.attention_cv || '')}</div>
            </div>
            <div class="p-3 overflow-y-auto" style="max-height: 160px;">
              <div class="col-label">Attention trad</div>
              {#if stream?.attention_trad}
                <div class="text-xs leading-relaxed" style="color: var(--color-purple-light);">{@html mdToHtml(stream.attention_trad)}</div>
              {:else}
                <div class="text-xs animate-pulse" style="color: var(--color-purple-lighter);">Analyse conductor en cours...</div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- STREAMING: 2-column grid -->
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
            <div id={`stream-${idx}`} class="p-3 overflow-y-auto stream-panel">
              {#if stream?.thinking}
                <pre class="text-xs font-mono whitespace-pre-wrap" style="color: var(--color-purple-light); opacity: 0.65; margin: 0;">{stream.thinking}</pre>
              {:else if !isProcessing}
                <div class="text-xs" style="color: var(--color-purple-lighter);">En attente...</div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <!-- Batch results -->
    {#if sessionStatus === 'done' || sessionStatus === 'error'}
      <div class="card p-6 mb-6">
        <h3 class="text-lg font-semibold mb-4">Téléchargements</h3>
        <div class="space-y-2">
          {#each outputs.filter(o => o.endsWith('.zip')) as zipFile}
            <div class="flex items-center justify-between p-3" style="background: var(--color-purple-bg);">
              <div>
                <span class="text-sm font-semibold">Tous les profils (ZIP)</span>
                <span class="text-xs ml-2" style="color: var(--color-purple-lighter);">{zipFile}</span>
              </div>
              <button onclick={() => handleDownload(zipFile)} class="btn-primary text-xs py-2 px-4">Télécharger</button>
            </div>
          {/each}
          {#each outputs.filter(o => o === 'batch_summary.md') as summaryFile}
            <div class="flex items-center justify-between p-2" style="background: var(--color-purple-bg);">
              <span class="text-sm">Rapport de synthèse</span>
              <button onclick={() => handleDownload(summaryFile)} class="btn-secondary text-xs py-1 px-3">Télécharger</button>
            </div>
          {/each}
        </div>
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
    grid-template-columns: 1fr 1fr 1.5fr 1.5fr;
    gap: 0;
  }

  .stream-grid {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0;
    min-height: 120px;
  }

  .stream-panel {
    height: 160px;
    max-height: 160px;
  }

  @media (max-width: 768px) {
    .result-grid, .stream-grid {
      grid-template-columns: 1fr !important;
    }
    .stream-panel {
      height: 120px;
      max-height: 120px;
    }
  }
</style>
