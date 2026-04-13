<script lang="ts">
  import { onMount } from 'svelte';
  import { getModels, type ProviderInfo } from '$lib/api';

  let { selected = $bindable('') }: { selected?: string } = $props();

  let providers = $state<ProviderInfo[]>([]);
  let serverDefault = $state('');
  let loaded = $state(false);

  onMount(async () => {
    try {
      const data = await getModels();
      providers = data.providers;
      serverDefault = data.active;
      if (!selected) selected = data.active;
    } catch {
      // API not reachable — hide selector
    }
    loaded = true;
  });

  function select(id: string) {
    selected = id;
  }

  const ICONS: Record<string, string> = {
    anthropic: 'A',
    openai: 'O',
    mistral: 'M',
    gemini: 'G',
    cohere: 'C',
  };
</script>

{#if loaded && providers.length > 1}
  <div class="mb-5">
    <span class="block text-sm font-medium mb-1.5">Mod&egrave;le IA</span>
    <div class="flex flex-wrap gap-2">
      {#each providers as p}
        {@const isActive = p.id === selected}
        <button
          type="button"
          class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
          style="
            border: 2px solid {isActive ? 'var(--color-green)' : 'var(--color-purple-border)'};
            background: {isActive ? 'rgba(96, 187, 155, 0.08)' : 'white'};
            color: {isActive ? 'var(--color-purple-dark)' : 'var(--color-purple-lighter)'};
            cursor: pointer;
          "
          onclick={() => select(p.id)}
        >
          <span
            class="inline-flex items-center justify-center text-xs font-semibold"
            style="
              width: 22px; height: 22px;
              background: {isActive ? 'var(--color-green)' : 'var(--color-purple-border)'};
              color: {isActive ? 'white' : 'var(--color-purple-light)'};
            "
          >{ICONS[p.id] || '?'}</span>
          <span class="font-medium" style="color: {isActive ? 'var(--color-purple-dark)' : 'inherit'};">{p.label}</span>
          {#if isActive}
            <span class="text-xs" style="color: var(--color-green);">&#x2713;</span>
          {/if}
        </button>
      {/each}
    </div>
    <p class="text-xs mt-1.5" style="color: var(--color-purple-lighter);">
      {#each providers as p}
        {#if p.id === selected}
          {p.modelId} &mdash; ${p.costPer1MInput}/${p.costPer1MOutput} par 1M tokens &mdash; ~{p.co2ePer1kOutput < 1 ? `${(p.co2ePer1kOutput * 1000).toFixed(0)}mg` : `${p.co2ePer1kOutput.toFixed(1)}g`}CO2/1k tokens
        {/if}
      {/each}
    </p>
  </div>
{/if}
