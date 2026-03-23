<script>
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-screen flex flex-col">
  <!-- Header -->
  <header class="bg-scalian-dark text-white">
    <div class="max-w-[1248px] mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <!-- Scalian S logo (gradient) -->
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <defs>
            <linearGradient id="scalian-grad" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#E4005B" />
              <stop offset="31%" stop-color="#4B2979" />
              <stop offset="65%" stop-color="#5A8C8F" />
              <stop offset="100%" stop-color="#61BA9A" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="8" fill="url(#scalian-grad)" />
          <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
                font-family="Poppins, sans-serif" font-weight="600" font-size="22" fill="white">S</text>
        </svg>
        <span class="text-lg font-semibold tracking-wide uppercase" style="font-family: 'Poppins', sans-serif;">
          Scalian
        </span>
      </div>
      <nav class="text-sm font-medium text-white/70">
        CV Transpose
      </nav>
    </div>
  </header>

  <!-- Content -->
  <main class="flex-1">
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="bg-scalian-dark text-white/50 text-xs py-6">
    <div class="max-w-[1248px] mx-auto px-4 text-center">
      Scalian CV Transpose &mdash; Outil interne &mdash; Donn&eacute;es chiffr&eacute;es, purg&eacute;es sous 48h
    </div>
  </footer>
</div>
