<script>
  import '../app.css';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  let { children } = $props();
</script>

<Disclaimer />

<div class="min-h-screen flex flex-col">
  <!-- Header — Scalian dark purple -->
  <header class="bg-[#1D1148]">
    <div class="max-w-[1216px] mx-auto px-4 flex items-center justify-between" style="padding-top: 1.25rem; padding-bottom: 1.25rem;">
      <a href="/" class="flex items-center">
        <img src="/logo-scalian.svg" alt="Scalian" class="h-8" style="filter: brightness(0) invert(1);" />
      </a>
      <span class="text-white/60 text-sm font-medium" style="font-family: 'Inter', sans-serif;">
        CV Transpose
      </span>
    </div>
  </header>

  <!-- Content -->
  <main class="flex-1 bg-white">
    {@render children()}
  </main>

  <!-- Footer — Scalian dark purple -->
  <footer class="bg-[#1D1148]" style="padding-top: 2.25rem; padding-bottom: 2.25rem;">
    <div class="max-w-[1216px] mx-auto px-4 flex items-center justify-between">
      <img src="/logo-scalian.svg" alt="Scalian" class="h-5 opacity-40" style="filter: brightness(0) invert(1);" />
      <p class="text-white/40 text-xs" style="font-family: 'Inter', sans-serif;">
        Donn&eacute;es chiffr&eacute;es AES-256, purg&eacute;es sous 48h
      </p>
    </div>
  </footer>
</div>
