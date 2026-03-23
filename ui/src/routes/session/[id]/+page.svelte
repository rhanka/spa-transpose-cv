<script lang="ts">
  import { page } from '$app/stores';

  // Placeholder — will be fully implemented in Phase 5
  const sessionId = $derived($page.params.id);
</script>

<div class="max-w-[1248px] mx-auto px-4 py-16">
  <h2 class="text-2xl mb-8">Session : {sessionId}</h2>

  <!-- Password gate -->
  <section class="max-w-md mx-auto mb-12">
    <div class="border-2 border-scalian-purple-border p-8 shadow-scalian bg-white">
      <label class="block text-sm font-medium mb-2" for="session-password">
        Mot de passe de la session
      </label>
      <input
        id="session-password"
        type="password"
        placeholder="Entrez le mot de passe"
        class="w-full px-4 py-3 border-2 border-scalian-purple-border focus:border-scalian-purple focus:outline-none text-sm mb-4"
      />
      <button
        class="w-full py-3 text-sm font-semibold text-white border-2 border-scalian-green bg-scalian-green hover:bg-scalian-green-hover transition-all"
      >
        Acc&eacute;der
      </button>
    </div>
  </section>

  <!-- Progress placeholder -->
  <section class="hidden">
    <h3 class="text-xl mb-4">Progression</h3>
    <div class="space-y-3">
      <!-- CV items will go here -->
    </div>
  </section>
</div>
