<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    Alert,
    Button,
    Input,
    Header,
    Tag,
  } from '@sentropic/design-system-svelte';
  import {
    ExternalLink,
    LogOut,
    RefreshCw,
    Search,
    UserRound,
  } from '@lucide/svelte';
  import {
    fetchTenantMarketplacePublicationAsset,
    fetchTenantMarketplacePublicationByTenantKey,
    fetchTenantMarketplacePublications,
    getAdminPasskeyLoginOptions,
    getAdminPasskeyRegistrationOptions,
    requestAdminAuthOtp,
    verifyAdminAuthOtp,
    verifyAdminPasskeyLogin,
    verifyAdminPasskeyRegistration,
    type AdminPasskeySessionResponse,
    type TenantMarketplaceAssetName,
    type TenantMarketplacePublication,
  } from '$lib/api';
  import {
    getAdminWebAuthnErrorMessage,
    isAdminWebAuthnSupported,
    startAdminPasskeyAuthentication,
    startAdminPasskeyRegistration,
  } from '$lib/services/admin-webauthn-client';

  const ADMIN_TOKEN_STORAGE_KEY = 'cv-transpose-admin-token';
  const ADMIN_EMAIL_STORAGE_KEY = 'cv-transpose-admin-email';
  const codeIndexes = [0, 1, 2, 3, 4, 5];

  let email = $state('');
  let codeDigits = $state(['', '', '', '', '', '']);
  let otpChallengeId = $state('');
  let verificationToken = $state('');
  let tenantKey = $state('');
  let adminToken = $state('');
  let adminEmail = $state('');
  let expiresAt = $state('');
  let publications = $state<TenantMarketplacePublication[]>([]);
  let selectedPublication = $state<TenantMarketplacePublication | null>(null);
  let webauthnSupported = $state(true);
  let authView = $state<'login' | 'register'>('login');
  let registerStep = $state<'email' | 'code' | 'passkey'>('email');
  let loadingSession = $state(false);
  let loadingOtp = $state(false);
  let loadingOtpVerify = $state(false);
  let loadingRegistration = $state(false);
  let loadingPublications = $state(false);
  let loadingLookup = $state(false);
  let loadingAsset = $state('');
  let authNotice = $state('');
  let error = $state('');

  const publishedCount = $derived(publications.filter((publication) => publication.status === 'published').length);
  const draftCount = $derived(publications.filter((publication) => publication.status === 'draft').length);
  const otpCode = $derived(codeDigits.join(''));

  function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  function storeAdminSession(session: AdminPasskeySessionResponse) {
    adminToken = session.token;
    adminEmail = session.email;
    expiresAt = session.expiresAt;
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, session.token);
    sessionStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, session.email);
  }

  function resetEnrollment() {
    codeDigits = ['', '', '', '', '', ''];
    otpChallengeId = '';
    verificationToken = '';
    registerStep = 'email';
    authNotice = '';
  }

  function focusCodeInput(index: number) {
    const input = document.getElementById(`admin-code-${index}`) as HTMLInputElement | null;
    input?.focus();
  }

  async function loadPublications(token = adminToken) {
    if (!token) {
      return;
    }

    loadingPublications = true;
    error = '';
    try {
      const response = await fetchTenantMarketplacePublications(token);
      publications = response.tenants;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loadingPublications = false;
    }
  }

  async function handlePasskeyLogin() {
    if (!webauthnSupported) {
      error = 'Passkeys non supportées par ce navigateur.';
      return;
    }

    loadingSession = true;
    error = '';
    authNotice = '';
    try {
      const response = await getAdminPasskeyLoginOptions();
      const credential = await startAdminPasskeyAuthentication(response.options);
      const session = await verifyAdminPasskeyLogin(credential);
      email = session.email;
      storeAdminSession(session);
      await loadPublications(session.token);
    } catch (err) {
      error = getAdminWebAuthnErrorMessage(err);
    } finally {
      loadingSession = false;
    }
  }

  async function handleRequestOtp() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      error = 'Email admin invalide.';
      return;
    }

    email = normalizedEmail;
    loadingOtp = true;
    error = '';
    authNotice = '';
    try {
      const response = await requestAdminAuthOtp(normalizedEmail);
      email = response.email;
      otpChallengeId = response.challengeId;
      codeDigits = ['', '', '', '', '', ''];
      verificationToken = '';
      registerStep = 'code';
      authNotice = response.delivery === 'log' && response.devOtp
        ? `Code de dev: ${response.devOtp}`
        : `Code envoyé à ${response.email}.`;
      await tick();
      focusCodeInput(0);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loadingOtp = false;
    }
  }

  function handleCodeInput(index: number, value: string) {
    const nextDigits = [...codeDigits];
    const digit = value.replace(/[^0-9]/g, '').slice(0, 1);
    nextDigits[index] = digit;
    codeDigits = nextDigits;

    if (digit && index < codeDigits.length - 1) {
      focusCodeInput(index + 1);
    }
  }

  function handleCodeKeydown(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !codeDigits[index] && index > 0) {
      const nextDigits = [...codeDigits];
      nextDigits[index - 1] = '';
      codeDigits = nextDigits;
      focusCodeInput(index - 1);
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      focusCodeInput(index - 1);
    }
    if (event.key === 'ArrowRight' && index < codeDigits.length - 1) {
      focusCodeInput(index + 1);
    }
  }

  function handleCodePaste(event: ClipboardEvent) {
    event.preventDefault();
    const digits = event.clipboardData?.getData('text').replace(/[^0-9]/g, '').slice(0, 6).split('') ?? [];
    const nextDigits = ['', '', '', '', '', ''];
    for (const [index, digit] of digits.entries()) {
      nextDigits[index] = digit;
    }
    codeDigits = nextDigits;
    focusCodeInput(Math.min(digits.length, 5));
  }

  async function handleVerifyOtp() {
    if (!otpChallengeId || otpCode.length !== 6) {
      error = 'Code email requis.';
      return;
    }

    loadingOtpVerify = true;
    error = '';
    authNotice = '';
    try {
      const response = await verifyAdminAuthOtp(otpChallengeId, otpCode);
      email = response.email;
      verificationToken = response.verificationToken;
      registerStep = 'passkey';
      authNotice = 'Email validé.';
    } catch (err) {
      codeDigits = ['', '', '', '', '', ''];
      error = (err as Error).message;
      await tick();
      focusCodeInput(0);
    } finally {
      loadingOtpVerify = false;
    }
  }

  async function handleRegisterPasskey() {
    if (!webauthnSupported) {
      error = 'Passkeys non supportées par ce navigateur.';
      return;
    }
    if (!email.trim() || !verificationToken) {
      error = 'Validation email requise.';
      return;
    }

    loadingRegistration = true;
    error = '';
    authNotice = '';
    try {
      const optionsResponse = await getAdminPasskeyRegistrationOptions({
        email: email.trim(),
        verificationToken,
      });
      const credential = await startAdminPasskeyRegistration(optionsResponse.options);
      const session = await verifyAdminPasskeyRegistration({
        email: optionsResponse.email,
        verificationToken,
        credential,
        deviceName: 'Backoffice',
      });
      email = session.email;
      storeAdminSession(session);
      resetEnrollment();
      await loadPublications(session.token);
    } catch (err) {
      error = getAdminWebAuthnErrorMessage(err);
    } finally {
      loadingRegistration = false;
    }
  }

  async function handleLookup() {
    if (!tenantKey.trim()) {
      error = 'tenantKey requis.';
      return;
    }

    loadingLookup = true;
    error = '';
    try {
      selectedPublication = await fetchTenantMarketplacePublicationByTenantKey(adminToken, tenantKey.trim());
    } catch (err) {
      selectedPublication = null;
      error = (err as Error).message;
    } finally {
      loadingLookup = false;
    }
  }

  async function openPublicationAsset(publication: TenantMarketplacePublication, asset: TenantMarketplaceAssetName) {
    const assetKey = `${publication.tenantKey}:${asset}`;
    loadingAsset = assetKey;
    error = '';
    try {
      const blob = await fetchTenantMarketplacePublicationAsset({
        token: adminToken,
        tenantKey: publication.tenantKey,
        asset,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      if (asset === 'base.docx') {
        link.download = `${publication.slug}-base.docx`;
      } else {
        link.target = '_blank';
        link.rel = 'noreferrer';
      }
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loadingAsset = '';
    }
  }

  async function openSelectedPublicationAsset(asset: TenantMarketplaceAssetName) {
    if (!selectedPublication) {
      return;
    }
    await openPublicationAsset(selectedPublication, asset);
  }

  function isSelectedPublicationAssetLoading(asset: TenantMarketplaceAssetName): boolean {
    return Boolean(selectedPublication && loadingAsset === `${selectedPublication.tenantKey}:${asset}`);
  }

  function handleLogout() {
    adminToken = '';
    adminEmail = '';
    expiresAt = '';
    publications = [];
    selectedPublication = null;
    tenantKey = '';
    authNotice = '';
    error = '';
    authView = 'login';
    resetEnrollment();
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
  }

  function openPublication(publication: TenantMarketplacePublication) {
    selectedPublication = publication;
    tenantKey = publication.tenantKey;
  }

  onMount(() => {
    webauthnSupported = isAdminWebAuthnSupported();
    const storedToken = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    const storedEmail = sessionStorage.getItem(ADMIN_EMAIL_STORAGE_KEY);
    if (storedEmail) {
      adminEmail = storedEmail;
      email = storedEmail;
    }
    if (!storedToken) {
      return;
    }

    adminToken = storedToken;
    loadPublications(storedToken);
  });
</script>

<svelte:head>
  <title>Backoffice | CV Transpose</title>
</svelte:head>

<div class="admin-root">
  <Header title="CV Transpose" label="Backoffice CV Transpose" sticky={true}>
    {#snippet navigation()}
      <div class="admin-nav">
        <span class="admin-nav-link active">Publications</span>
      </div>
    {/snippet}

    {#snippet actions()}
      <span class="admin-version">Admin</span>
      <a class="admin-header-link" href="https://www.sent-tech.ca/" target="_blank" rel="noreferrer">
        sent-tech.ca
        <ExternalLink size={14} strokeWidth={2} />
      </a>
      {#if adminToken}
        <span class="admin-header-user">
          <UserRound size={16} strokeWidth={2} />
          <span>{adminEmail || 'Session'}</span>
        </span>
        <Button size="sm" variant="secondary" onclick={handleLogout}>
          <LogOut size={14} strokeWidth={2} />
          Déconnexion
        </Button>
      {/if}
    {/snippet}
  </Header>

  <section class="admin-page">
    <div class="admin-shell">
      <div class="page-heading">
        <p class="admin-kicker">Backoffice</p>
        <h1>Publications marketplace</h1>
      </div>

      {#if error}
        <Alert tone="error" title="Erreur" message={error} />
      {/if}

      {#if !adminToken}
        <div class="auth-card">
          {#if !webauthnSupported}
            <Alert tone="error" title="Passkey indisponible" message="Passkeys non supportées par ce navigateur." />
          {:else if authView === 'login'}
            <div class="auth-heading">
              <p class="admin-kicker">Accès admin</p>
              <h2>Connexion par passkey</h2>
              <p>Utilise la passkey déjà enregistrée pour ce backoffice.</p>
            </div>

            <Button variant="primary" onclick={handlePasskeyLogin} disabled={loadingSession}>
              {loadingSession ? 'Connexion...' : 'Se connecter avec une passkey'}
            </Button>

            <button type="button" class="text-button" onclick={() => { authView = 'register'; resetEnrollment(); }}>
              Enregistrer ou remplacer une passkey
            </button>
          {:else}
            <div class="auth-heading">
              <p class="admin-kicker">Enrôlement</p>
              <h2>OTP email + passkey</h2>
              <p>Valide l’email admin, puis enregistre une passkey sur cet appareil.</p>
            </div>

            {#if registerStep === 'email'}
              <form class="auth-form" onsubmit={(event) => { event.preventDefault(); handleRequestOtp(); }}>
                <Input
                  id="admin-register-email"
                  type="email"
                  label="Email admin"
                  bind:value={email}
                  placeholder="admin@example.com"
                />
                <Button type="submit" variant="primary" disabled={loadingOtp || !isValidEmail(email)}>
                  {loadingOtp ? 'Envoi...' : 'Recevoir le code'}
                </Button>
              </form>
            {:else if registerStep === 'code'}
              <form class="auth-form" onsubmit={(event) => { event.preventDefault(); handleVerifyOtp(); }}>
                <Input
                  id="admin-register-email-locked"
                  type="email"
                  label="Email admin"
                  value={email}
                  disabled
                />
                <div>
                  <label class="code-label" for="admin-code-0">Code email</label>
                  <div class="code-grid" onpaste={handleCodePaste}>
                    {#each codeIndexes as index}
                      <input
                        id={`admin-code-${index}`}
                        type="text"
                        inputmode="numeric"
                        maxlength="1"
                        value={codeDigits[index]}
                        disabled={loadingOtpVerify}
                        oninput={(event) => handleCodeInput(index, event.currentTarget.value)}
                        onkeydown={(event) => handleCodeKeydown(index, event)}
                        autocomplete="one-time-code"
                      />
                    {/each}
                  </div>
                </div>
                <Button type="submit" variant="primary" disabled={loadingOtpVerify || otpCode.length !== 6}>
                  {loadingOtpVerify ? 'Validation...' : 'Valider le code'}
                </Button>
                <button type="button" class="text-button" onclick={() => { registerStep = 'email'; codeDigits = ['', '', '', '', '', '']; }}>
                  Changer d’email
                </button>
              </form>
            {:else if registerStep === 'passkey'}
              <div class="auth-confirmation">
                <strong>Email validé</strong>
                <span>{email}</span>
              </div>
              <Button variant="primary" onclick={handleRegisterPasskey} disabled={loadingRegistration}>
                {loadingRegistration ? 'Enregistrement...' : 'Enregistrer la passkey'}
              </Button>
            {/if}

            {#if authNotice}
              <p class="auth-notice">{authNotice}</p>
            {/if}

            <button type="button" class="text-button" onclick={() => { authView = 'login'; resetEnrollment(); }}>
              Retour à la connexion
            </button>
          {/if}
        </div>
      {:else}
        <div class="admin-toolbar">
          <div class="admin-metrics" aria-label="Statuts publication">
            <div>
              <span>{publications.length}</span>
              <small>Total</small>
            </div>
            <div>
              <span>{publishedCount}</span>
              <small>Publiés</small>
            </div>
            <div>
              <span>{draftCount}</span>
              <small>Brouillons</small>
            </div>
          </div>

          <div class="admin-actions">
            <Button variant="secondary" onclick={() => loadPublications()} disabled={loadingPublications}>
              <RefreshCw size={15} strokeWidth={2} />
              {loadingPublications ? 'Chargement...' : 'Rafraîchir'}
            </Button>
          </div>
        </div>

        <div class="admin-lookup">
          <Input
            id="admin-tenant-key"
            type="text"
            label="tenantKey"
            bind:value={tenantKey}
            placeholder="direct:scalian"
          />
          <Button variant="primary" onclick={handleLookup} disabled={loadingLookup}>
            <Search size={15} strokeWidth={2} />
            {loadingLookup ? 'Recherche...' : 'Chercher'}
          </Button>
        </div>

        {#if selectedPublication}
          <article class="publication-detail">
            <div>
              <p class="publication-label">Sélection</p>
              <h2>{selectedPublication.displayName}</h2>
              <code>{selectedPublication.tenantKey}</code>
            </div>
            <Tag tone={selectedPublication.status === 'published' ? 'success' : 'warning'} size="sm">
              {selectedPublication.status === 'published' ? 'Publié' : 'Brouillon'}
            </Tag>
            <div class="asset-links">
              <button type="button" onclick={() => openSelectedPublicationAsset('manifest')} disabled={isSelectedPublicationAssetLoading('manifest')}>
                manifest
              </button>
              <button type="button" onclick={() => openSelectedPublicationAsset('base.docx')} disabled={isSelectedPublicationAssetLoading('base.docx')}>
                base.docx
              </button>
              <button type="button" onclick={() => openSelectedPublicationAsset('brand')} disabled={isSelectedPublicationAssetLoading('brand')}>
                brand
              </button>
            </div>
          </article>
        {/if}

        <div class="publication-table" aria-busy={loadingPublications}>
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Statut</th>
                <th>tenantKey</th>
                <th>Assets</th>
              </tr>
            </thead>
            <tbody>
              {#each publications as publication}
                <tr>
                  <td>
                    <button type="button" class="tenant-button" onclick={() => openPublication(publication)}>
                      {publication.displayName}
                      <span>{publication.slug}</span>
                    </button>
                  </td>
                  <td>
                    <Tag tone={publication.status === 'published' ? 'success' : 'warning'} size="sm">
                      {publication.status === 'published' ? 'Publié' : 'Brouillon'}
                    </Tag>
                  </td>
                  <td><code>{publication.tenantKey}</code></td>
                  <td class="asset-links">
                    <button type="button" onclick={() => openPublicationAsset(publication, 'manifest')} disabled={loadingAsset === `${publication.tenantKey}:manifest`}>
                      manifest
                    </button>
                    <button type="button" onclick={() => openPublicationAsset(publication, 'base.docx')} disabled={loadingAsset === `${publication.tenantKey}:base.docx`}>
                      docx
                    </button>
                    <button type="button" onclick={() => openPublicationAsset(publication, 'brand')} disabled={loadingAsset === `${publication.tenantKey}:brand`}>
                      brand
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .admin-root {
    --st-semantic-surface-default: #ffffff;
    --st-semantic-surface-subtle: #f8fafc;
    --st-semantic-surface-raised: #ffffff;
    --st-semantic-text-primary: #0f172a;
    --st-semantic-text-secondary: #475569;
    --st-semantic-text-muted: #64748b;
    --st-semantic-text-link: oklch(50% 0.134 242.749);
    --st-semantic-border-subtle: #e2e8f0;
    --st-semantic-border-strong: #94a3b8;
    --st-semantic-border-interactive: oklch(50% 0.134 242.749);
    --st-semantic-action-primary: oklch(50% 0.134 242.749);
    --st-semantic-action-primaryText: #ffffff;
    --st-semantic-action-secondary: #f8fafc;
    --st-semantic-action-secondaryText: #0f172a;
    --st-semantic-feedback-success: #16a34a;
    --st-semantic-feedback-warning: #d97706;
    --st-semantic-feedback-error: #dc2626;
    --st-component-button-radius: 0.375rem;
    --st-component-button-primaryBackground: oklch(50% 0.134 242.749);
    --st-component-button-primaryText: #ffffff;
    --st-component-button-secondaryBackground: #f8fafc;
    --st-component-button-secondaryText: #0f172a;
    --st-component-card-background: #ffffff;
    --st-component-card-border: #e2e8f0;
    --st-component-card-radius: 0.5rem;
    --st-component-card-shadow: 0 1px 2px rgb(15 23 42 / 0.08);
    --st-component-control-background: #ffffff;
    --st-component-control-border: #e2e8f0;
    --st-component-control-hoverBorder: #94a3b8;
    --st-component-control-focusRing: oklch(50% 0.134 242.749);
    --st-component-control-placeholderText: #64748b;
    --st-component-control-radius: 0.375rem;
    --st-component-field-labelText: #0f172a;
    --st-component-field-helpText: #475569;
    --st-component-field-maxWidth: 100%;
    min-height: 100vh;
    background: var(--st-semantic-surface-subtle);
    color: var(--st-semantic-text-primary);
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .admin-root :global(.st-header) {
    box-shadow: none;
  }

  .admin-root :global(.st-header__navigation) {
    flex: 0 1 auto;
    justify-content: flex-start;
    margin-left: 1rem;
  }

  .admin-root :global(.st-header__actions) {
    margin-left: auto;
  }

  .admin-root :global(.st-button) {
    white-space: nowrap;
  }

  .admin-page {
    min-height: calc(100vh - 3.5rem);
    padding: 1.5rem 1.5rem 3rem;
  }

  .admin-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .admin-nav {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    min-width: 0;
  }

  .admin-nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 3.5rem;
    color: var(--st-semantic-text-secondary);
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .admin-nav-link.active {
    color: var(--st-semantic-text-primary);
    font-weight: 650;
  }

  .admin-nav-link.active::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--st-semantic-border-interactive);
  }

  .admin-version,
  .admin-header-link,
  .admin-header-user {
    display: inline-flex;
    align-items: center;
    min-height: 2.25rem;
    gap: 0.35rem;
    padding: 0 0.75rem;
    border: 1px solid var(--st-semantic-border-subtle);
    border-radius: var(--st-component-button-radius);
    background: var(--st-semantic-surface-default);
    color: var(--st-semantic-text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
  }

  .admin-version {
    border-color: transparent;
    background: color-mix(in srgb, var(--st-semantic-feedback-success) 10%, white);
    color: #166534;
    font-weight: 700;
  }

  .admin-header-link:hover {
    color: var(--st-semantic-text-link);
  }

  .page-heading {
    padding: 0.25rem 0 0.5rem;
  }

  .admin-toolbar,
  .auth-card,
  .admin-lookup,
  .publication-detail,
  .publication-table {
    background: var(--st-component-card-background);
    border: 1px solid var(--st-component-card-border);
    border-radius: var(--st-component-card-radius);
    box-shadow: var(--st-component-card-shadow);
  }

  .admin-kicker,
  .publication-label {
    margin: 0 0 0.25rem;
    color: var(--st-semantic-text-secondary);
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    color: var(--st-semantic-text-primary);
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  h1 {
    font-size: 1.875rem;
    line-height: 1.2;
  }

  h2 {
    font-size: 1.25rem;
    line-height: 1.25;
  }

  .auth-card {
    width: min(480px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
  }

  .auth-heading {
    display: grid;
    gap: 0.35rem;
    text-align: center;
  }

  .auth-heading p:last-child,
  .auth-confirmation span {
    margin: 0;
    color: var(--st-semantic-text-secondary);
    font-size: 0.9rem;
  }

  .auth-form {
    display: grid;
    gap: 1rem;
  }

  .text-button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--st-semantic-text-link);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 650;
    cursor: pointer;
    text-align: center;
  }

  .text-button:hover,
  .asset-links button:hover {
    text-decoration: underline;
  }

  .code-label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--st-semantic-text-primary);
    font-size: 0.875rem;
    font-weight: 650;
  }

  .code-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .code-grid input {
    width: 100%;
    height: 3.25rem;
    border: 1px solid var(--st-component-control-border);
    border-radius: var(--st-component-control-radius);
    background: var(--st-component-control-background);
    color: var(--st-semantic-text-primary);
    font-size: 1.35rem;
    font-weight: 650;
    text-align: center;
  }

  .code-grid input:focus {
    border-color: var(--st-component-control-focusRing);
    outline: 2px solid color-mix(in srgb, var(--st-component-control-focusRing) 25%, transparent);
    outline-offset: 1px;
  }

  .auth-confirmation,
  .auth-notice {
    display: grid;
    gap: 0.25rem;
    padding: 0.85rem 0.95rem;
    border-radius: var(--st-component-card-radius);
    background: var(--st-semantic-surface-subtle);
    color: var(--st-semantic-text-secondary);
    font-size: 0.9rem;
  }

  .auth-confirmation strong {
    color: var(--st-semantic-text-primary);
  }

  .admin-lookup {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
    padding: 1rem;
  }

  .admin-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem;
  }

  .admin-metrics {
    display: flex;
    gap: 0.75rem;
  }

  .admin-metrics div {
    min-width: 6.5rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--st-semantic-border-subtle);
    border-radius: var(--st-component-card-radius);
    background: var(--st-semantic-surface-subtle);
  }

  .admin-metrics span,
  .admin-metrics small {
    display: block;
  }

  .admin-metrics span {
    color: var(--st-semantic-text-primary);
    font-size: 1.25rem;
    font-weight: 700;
  }

  .admin-metrics small {
    color: var(--st-semantic-text-secondary);
    font-size: 0.78rem;
  }

  .admin-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: flex-end;
  }

  .publication-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
  }

  .publication-detail code,
  .publication-table code {
    color: var(--st-semantic-text-primary);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.875rem;
    white-space: nowrap;
  }

  .asset-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .asset-links button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--st-semantic-text-link);
    font: inherit;
    font-size: 0.84rem;
    font-weight: 650;
    cursor: pointer;
  }

  .asset-links button:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .publication-table {
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 780px;
    border-collapse: separate;
    border-spacing: 0;
  }

  th,
  td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--st-semantic-border-subtle);
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: var(--st-semantic-surface-subtle);
    color: var(--st-semantic-text-secondary);
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  .tenant-button {
    display: inline-flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--st-semantic-text-primary);
    font: inherit;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }

  .tenant-button span {
    color: var(--st-semantic-text-secondary);
    font-size: 0.78rem;
    font-weight: 500;
  }

  @media (max-width: 720px) {
    .admin-toolbar,
    .publication-detail {
      align-items: stretch;
      flex-direction: column;
    }

    .admin-lookup,
    .publication-detail {
      grid-template-columns: 1fr;
    }

    .admin-metrics {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .admin-metrics div {
      min-width: 0;
    }

    .admin-actions {
      justify-content: stretch;
    }

    .admin-root :global(.st-header) {
      height: auto;
      min-height: 3.5rem;
      flex-wrap: wrap;
      padding-top: 0.5rem;
      padding-bottom: 0.5rem;
    }

    .admin-nav {
      display: none;
    }

    .admin-header-link,
    .admin-header-user,
    .admin-version {
      min-height: 2rem;
      padding: 0 0.5rem;
    }
  }
</style>
