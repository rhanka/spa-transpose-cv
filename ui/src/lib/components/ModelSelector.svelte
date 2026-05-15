<script lang="ts">
  import { onMount } from 'svelte';
  import { Card } from '@sentropic/design-system-svelte';
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
    <span id="model-selector-label" class="block text-sm font-medium mb-1.5">Mod&egrave;le IA</span>
    <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="model-selector-label">
      {#each providers as p}
        {@const isActive = p.id === selected}
        <Card
          interactive
          class={`model-chip${isActive ? ' model-chip--active' : ''}`}
          role="radio"
          tabindex={isActive ? 0 : -1}
          aria-checked={isActive}
          aria-label={p.label}
          onclick={() => select(p.id)}
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              select(p.id);
            }
          }}
        >
          <span class="model-chip__icon" class:model-chip__icon--active={isActive}>
            {ICONS[p.id] || '?'}
          </span>
          <span class="model-chip__label" class:model-chip__label--active={isActive}>{p.label}</span>
          {#if isActive}
            <span class="model-chip__check">&#x2713;</span>
          {/if}
        </Card>
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

<style>
  :global(.model-chip) {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    border: 2px solid var(--color-purple-border);
    background: white;
    color: var(--color-purple-lighter);
    cursor: pointer;
    font-size: 0.875rem;
    box-shadow: none;
  }

  :global(.model-chip--active) {
    border-color: var(--color-green);
    background: rgba(96, 187, 155, 0.08);
    color: var(--color-purple-dark);
  }

  .model-chip__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: var(--color-purple-border);
    color: var(--color-purple-light);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .model-chip__icon--active {
    background: var(--color-green);
    color: white;
  }

  .model-chip__label {
    font-weight: 500;
  }

  .model-chip__label--active {
    color: var(--color-purple-dark);
  }

  .model-chip__check {
    font-size: 0.75rem;
    color: var(--color-green);
  }
</style>
