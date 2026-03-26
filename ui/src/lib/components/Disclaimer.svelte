<script lang="ts">
  import { onMount } from 'svelte';

  let show = $state(false);

  onMount(() => {
    if (!localStorage.getItem('disclaimer_accepted')) {
      show = true;
    }
  });

  function accept() {
    localStorage.setItem('disclaimer_accepted', new Date().toISOString());
    show = false;
  }
</script>

{#if show}
  <div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(29, 17, 72, 0.85);">
    <div class="bg-white max-w-lg mx-4 p-8" style="box-shadow: var(--shadow-card);">
      <h2 class="text-xl font-semibold mb-4" style="font-family: 'Poppins', sans-serif; color: var(--color-purple-dark);">
        Terms of Use
      </h2>
      <div class="text-sm space-y-3 mb-6" style="color: var(--color-purple-light); line-height: 1.6;">
        <p>By using this service, you acknowledge the following:</p>
        <ul class="list-disc pl-5 space-y-1.5">
          <li>Data is stored on <strong>Scaleway</strong>, Paris region (France)</li>
          <li>All files are encrypted at rest with <strong>AES-256-GCM</strong>, key derived from your password</li>
          <li>CV analysis is performed by the <strong>AI model you select</strong>. Data processing locations vary by provider:
            <ul class="list-disc pl-5 mt-1 space-y-0.5">
              <li><strong>Mistral Small 4</strong> (Mistral AI) &mdash; EU (France)</li>
              <li><strong>GPT-5.4 Nano</strong> (OpenAI) &mdash; US</li>
              <li><strong>Claude Sonnet 4.6</strong> (Anthropic) &mdash; US</li>
              <li><strong>Command A Reasoning</strong> (Cohere, Canada) &mdash; US</li>
              <li><strong>Gemini 3.1 Pro</strong> (Google) &mdash; US</li>
            </ul>
          </li>
          <li>Regardless of provider, all files are <strong>encrypted before transmission</strong> and <strong>no training is performed</strong> on your data (API usage)</li>
          <li>All data is <strong>automatically deleted after 48 hours</strong></li>
        </ul>
        <p class="text-xs mt-4" style="color: var(--color-purple-lighter);">
          This product is developed by <strong>Sent-Tech</strong>. Sent-Tech disclaims all liability
          beyond these standard conditions. The user assumes all legal and regulatory obligations
          applicable in their jurisdiction.
        </p>
      </div>
      <button onclick={accept} class="w-full btn-primary">
        I accept these conditions
      </button>
    </div>
  </div>
{/if}
