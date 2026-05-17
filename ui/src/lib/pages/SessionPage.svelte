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
  import { buildTenantPath } from '$lib/tenant';
  import { sessionPassword } from '$lib/stores/session';
  import { tenantConfig, tenantSlug } from '$lib/stores/tenant';
  import {
    Alert,
    Badge,
    Button,
    Card,
    CopyButton,
    InlineLoading,
    PasswordInput,
    ProgressBar,
  } from '@sentropic/design-system-svelte';

  const id = $derived($page.params.id ?? '');
  const currentTenantSlug = $derived($page.params.tenant ?? $tenantSlug);
  const homeHref = $derived(buildTenantPath(currentTenantSlug, '/'));
  const shareUrl = $derived(typeof window === 'undefined' ? '' : `${window.location.origin}${buildTenantPath(currentTenantSlug, `/session/${id}`)}`);

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
    tokenInfo: string;
    lastUpdate: number;
  }>>({});

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
    eventSource?.close();
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
        const prev = fileStreams[ev.fileIndex] || { phase: '', thinking: '', elapsed_ms: 0, parsed_keys: {}, attention_cv: '', attention_trad: '', tokenInfo: '', lastUpdate: Date.now() };
        const newThinking = prev.thinking + (ev.thinking_delta || '');
        fileStreams = {
          ...fileStreams,
          [ev.fileIndex]: {
            phase: ev.phase || prev.phase,
            thinking: newThinking.length > 2000 ? '...' + newThinking.slice(-1500) : newThinking,
            elapsed_ms: ev.elapsed_ms ?? prev.elapsed_ms,
            parsed_keys: ev.parsed_keys ? { ...prev.parsed_keys, ...ev.parsed_keys } : prev.parsed_keys,
            attention_cv: ev.attention_cv || prev.attention_cv,
            attention_trad: ev.attention_trad || prev.attention_trad,
            tokenInfo: ev.tokenInfo || prev.tokenInfo,
            lastUpdate: Date.now(),
          },
        };
      }
    }, currentTenantSlug);
  }

  async function loadResults() {
    try { const res = await getResults(id, currentTenantSlug); outputs = res.outputs; } catch { /* */ }
  }

  async function handleDownload(fileName: string) {
    try {
      const blob = await downloadFile(id, password, fileName, currentTenantSlug);
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
  <div class="flex items-center justify-between mb-6 gap-4">
    <div>
      <a href={homeHref} class="text-xs font-semibold uppercase tracking-[0.12em]" style="color: var(--color-green);">Nouvelle conversion</a>
      <h2 class="text-2xl mt-2">Session {$tenantConfig?.displayName ? `• ${$tenantConfig.displayName}` : ''}</h2>
    </div>
    <code class="text-xs px-3 py-1" style="background: var(--color-purple-bg); color: var(--color-purple-light);">{id}</code>
  </div>

  {#if !authenticated}
    <section class="max-w-md mx-auto">
      <Card class="session-auth-card">
        <div class="session-auth-stack">
          <PasswordInput
            id="sp"
            label="Mot de passe"
            placeholder="Mot de passe de la session"
            bind:value={password}
            onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') authenticate(); }}
          />
          <Button variant="primary" class="session-auth-submit" onclick={authenticate}>Accéder</Button>
        </div>
      </Card>
    </section>
  {:else}
    {#if files.length > 0}
      {@const doneCount = files.filter((f) => f.status === 'done' || f.status === 'error').length}
      {@const conductorDone = Object.values(fileStreams).filter((s) => s.attention_trad && s.attention_trad !== '').length}
      {@const totalSteps = files.length * 2}
      {@const completedSteps = doneCount + conductorDone}
      {@const pct = Math.round((completedSteps / totalSteps) * 100)}
      <div class="mb-6">
        <ProgressBar
          label="{doneCount}/{files.length} profils + {conductorDone}/{doneCount || 0} validations"
          value={completedSteps}
          max={totalSteps}
          tone={sessionStatus === 'error' ? 'error' : 'success'}
          size="sm"
          showValue
          valueText="{pct}%"
        />
      </div>
    {/if}

    <div class="space-y-3 mb-8">
      {#each files as file, idx}
        {@const stream = fileStreams[idx]}
        {@const isDone = file.status === 'done'}
        {@const isError = file.status === 'error'}
        {@const isProcessing = file.status === 'processing'}

        {#if isDone}
          <div class="card result-grid">
            <div class="p-3 border-r" style="border-color: var(--color-purple-border);">
              <div class="col-label">Source</div>
              <div class="text-sm truncate" title={file.name}>{file.name}</div>
            </div>
            <div class="p-3 border-r" style="border-color: var(--color-purple-border); min-width: 0;">
              <div class="col-label">DOCX</div>
              {#if file.output}
                <button onclick={() => handleDownload(file.output!)} class="text-sm font-semibold block truncate max-w-full" style="color: var(--color-green); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title={file.output}>{file.output}</button>
                {#if stream?.tokenInfo}
                  <div class="text-xs mt-1" style="color: var(--color-purple-lighter);">{stream.tokenInfo}</div>
                {/if}
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
          <div class="card stream-grid">
            <div class="p-3 border-r flex flex-col" style="border-color: var(--color-purple-border);">
              <div class="text-sm font-medium truncate mb-2">{file.name}</div>
              {#if isError}
                <Badge tone="error">Erreur</Badge>
                {#if file.error}<div class="text-xs mt-1" style="color: var(--st-semantic-feedback-error, #b91c1c);">{file.error}</div>{/if}
              {:else if isProcessing && stream}
                <InlineLoading
                  status={isStalled(idx) ? 'error' : 'active'}
                  label="{phaseLabel(stream.phase)} ({formatMs(stream.elapsed_ms)})"
                />
                {#if isStalled(idx)}
                  <div class="text-xs mt-1" style="color: #d97706;">Possible blocage (&gt;2min)</div>
                {/if}
                {#if stream.parsed_keys?.name}
                  <div class="text-xs mt-2" style="color: var(--color-purple-light);">Candidat : {stream.parsed_keys.name}</div>
                {/if}
              {:else}
                <Badge tone="neutral">En attente</Badge>
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

    {#if sessionStatus === 'done' || sessionStatus === 'error'}
      <Card class="session-download-card">
        <h3 class="text-lg font-semibold mb-4">Téléchargements</h3>
        {#each outputs.filter((o) => o.endsWith('.zip')) as zipFile}
          <div class="flex items-center justify-between p-3" style="background: var(--color-purple-bg);">
            <div>
              <span class="text-sm font-semibold">Tous les profils (ZIP)</span>
              <span class="text-xs ml-2" style="color: var(--color-purple-lighter);">{zipFile}</span>
            </div>
            <Button variant="primary" size="sm" onclick={() => handleDownload(zipFile)}>Télécharger</Button>
          </div>
        {/each}
        {#if expiresAt}
          <p class="text-xs mt-4" style="color: var(--color-purple-lighter);">Suppression le {formatExpiry(expiresAt)}</p>
        {/if}
      </Card>

      <div class="mb-6">
        <Alert
          tone="info"
          title="Recommandation de relecture"
          message="Certaines erreurs de transposition peuvent subsister. Nous recommandons une relecture attentive d'environ 15 minutes pour un CV de 10 ans d'expérience."
        />
      </div>

      <Card class="session-share-card">
        <p class="text-sm font-medium mb-2">Partager cette session</p>
        <div class="flex items-center gap-2">
          <input readonly value={shareUrl}
            class="flex-1 px-3 py-2 text-xs bg-white border" style="border-color: var(--color-purple-border);" />
          <CopyButton value={shareUrl} label="Copier" copiedLabel="Copié" size="sm" />
        </div>
        <p class="text-xs mt-2" style="color: var(--color-purple-lighter);">Le destinataire aura besoin du mot de passe.</p>
      </Card>
    {/if}

    {#if error}
      <div class="mt-4">
        <Alert tone="error" title="Erreur" message={error} />
      </div>
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

  :global(.session-auth-card) {
    padding: 2rem;
  }

  .session-auth-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  :global(.session-auth-submit) {
    width: 100%;
    justify-content: center;
  }

  :global(.session-download-card) {
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  :global(.session-share-card) {
    padding: 1rem;
  }
</style>
