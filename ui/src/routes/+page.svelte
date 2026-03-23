<script lang="ts">
  // Placeholder — will be fully implemented in Phase 5
</script>

<div class="max-w-[1248px] mx-auto px-4 py-16">
  <!-- Hero -->
  <section class="text-center mb-16">
    <h1 class="text-4xl md:text-5xl mb-4" style="color: var(--color-purple-dark);">
      Convertissez vos CVs au format Scalian
    </h1>
    <p class="text-lg text-scalian-purple-light max-w-2xl mx-auto">
      Uploadez un lot de CVs, ajoutez un prompt d'orientation, et laissez l'IA transformer
      chaque profil au format Scalian en parall&egrave;le.
    </p>
  </section>

  <!-- Upload card -->
  <section class="max-w-2xl mx-auto">
    <div class="border-2 border-scalian-purple-border p-8 shadow-scalian bg-white">
      <!-- File drop zone -->
      <div class="border-2 border-dashed border-scalian-purple-border p-12 text-center mb-6 hover:border-scalian-green transition-colors cursor-pointer">
        <p class="text-scalian-purple-light mb-2">Glissez vos fichiers ici ou cliquez pour s&eacute;lectionner</p>
        <p class="text-xs text-scalian-purple-light/60">PDF, DOCX, DOC &mdash; 50 Mo max au total</p>
      </div>

      <!-- Password -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-2" for="password">
          Mot de passe de chiffrement
        </label>
        <input
          id="password"
          type="password"
          placeholder="Choisissez un mot de passe pour prot&eacute;ger cette session"
          class="w-full px-4 py-3 border-2 border-scalian-purple-border focus:border-scalian-purple focus:outline-none text-sm"
        />
        <p class="text-xs text-scalian-purple-light/60 mt-1">
          N&eacute;cessaire pour acc&eacute;der aux r&eacute;sultats. Communiquez-le au destinataire du lien.
        </p>
      </div>

      <!-- Prompt -->
      <div class="mb-6">
        <label class="block text-sm font-medium mb-2" for="prompt">
          Prompt d'orientation <span class="text-scalian-purple-light/60 font-normal">(optionnel)</span>
        </label>
        <textarea
          id="prompt"
          rows="3"
          placeholder="Ex: Focus cloud/DevOps, profils anglais, consolider les postes > 20 ans..."
          class="w-full px-4 py-3 border-2 border-scalian-purple-border focus:border-scalian-purple focus:outline-none text-sm resize-none"
        ></textarea>
      </div>

      <!-- Submit -->
      <button
        class="w-full py-4 text-sm font-semibold text-white border-2 border-scalian-green bg-scalian-green hover:bg-scalian-green-hover transition-all"
        style="transition-timing-function: var(--ease-smooth);"
      >
        Lancer la conversion
      </button>
    </div>
  </section>
</div>
