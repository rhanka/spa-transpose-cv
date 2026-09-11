<script lang="ts">
  import { onMount } from 'svelte';

  const DISCLAIMER_VERSION = '2026-07-29-ovh-canada-fr';

  let show = $state(false);

  onMount(() => {
    if (localStorage.getItem('disclaimer_accepted') !== DISCLAIMER_VERSION) {
      show = true;
    }
  });

  function accept() {
    localStorage.setItem('disclaimer_accepted', DISCLAIMER_VERSION);
    show = false;
  }
</script>

{#if show}
  <div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(29, 17, 72, 0.85);">
    <div class="bg-white max-w-lg mx-4 p-8" style="box-shadow: var(--shadow-card);">
      <h2 class="text-xl font-semibold mb-4" style="font-family: 'Poppins', sans-serif; color: var(--color-purple-dark);">
        Conditions d’utilisation
      </h2>
      <div class="text-sm space-y-3 mb-6" style="color: var(--color-purple-light); line-height: 1.6;">
        <p>En utilisant ce service, vous reconnaissez les conditions suivantes :</p>
        <ul class="list-disc pl-5 space-y-1.5">
          <li>Les CV sont traités et hébergés temporairement sur l’infrastructure Kubernetes managée d’<strong>OVHcloud</strong>, au Canada.</li>
          <li>Les CV et documents générés sont chiffrés au repos avec <strong>AES-256-GCM</strong>, à l’aide d’une clé dérivée de votre mot de passe.</li>
          <li>L’analyse des CV est effectuée par le <strong>modèle d’IA que vous sélectionnez</strong>. Les lieux de traitement des données varient selon le fournisseur :
            <ul class="list-disc pl-5 mt-1 space-y-0.5">
              <li><strong>Mistral Small 4</strong> (Mistral AI) &mdash; EU (France)</li>
              <li><strong>GPT-5.6 Luna</strong> (OpenAI) &mdash; US</li>
              <li><strong>Claude Sonnet 5</strong> (Anthropic) &mdash; US</li>
              <li><strong>Command A Reasoning</strong> (Cohere, Canada) &mdash; US</li>
              <li><strong>Gemini 3.8 Flash</strong> (Google) &mdash; US</li>
            </ul>
          </li>
          <li>Quel que soit le fournisseur, les fichiers sont <strong>chiffrés avant leur transmission</strong> et vos données ne sont <strong>pas utilisées à des fins d’entraînement</strong> dans le cadre de l’utilisation de ces API.</li>
          <li>Les CV et documents générés sont <strong>automatiquement supprimés après 48 heures</strong>.</li>
        </ul>
        <p class="text-xs mt-4" style="color: var(--color-purple-lighter);">
          Ce produit est développé par <strong>Sent-Tech</strong>. Sent-Tech décline toute responsabilité
          au-delà de ces conditions standard. L’utilisateur assume l’ensemble des obligations légales et
          réglementaires applicables dans sa juridiction.
        </p>
      </div>
      <button onclick={accept} class="w-full btn-primary">
        J’accepte ces conditions
      </button>
    </div>
  </div>
{/if}
