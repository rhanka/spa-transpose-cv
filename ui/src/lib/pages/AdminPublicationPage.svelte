<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    Alert,
    Button,
    Input,
  } from '@sentropic/design-system-svelte';
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

<section class="admin-page">
  <div class="admin-shell">
    <header class="admin-header">
      <div>
        <p class="admin-kicker">Backoffice</p>
        <h1>Publications marketplace</h1>
      </div>
      {#if adminToken}
        <div class="admin-session">
          <div>
            <span>{adminEmail || 'Session'}</span>
            <strong>{expiresAt ? new Date(expiresAt).toLocaleString('fr-CA') : 'active'}</strong>
          </div>
          <Button variant="secondary" onclick={handleLogout}>Déconnexion</Button>
        </div>
      {/if}
    </header>

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
            {loadingPublications ? 'Chargement...' : 'Rafraîchir'}
          </Button>
          <Button variant="secondary" onclick={handleLogout}>Déconnexion</Button>
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
          <span class:status-draft={selectedPublication.status === 'draft'} class="status-pill">
            {selectedPublication.status === 'published' ? 'Publié' : 'Brouillon'}
          </span>
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
                  <span class:status-draft={publication.status === 'draft'} class="status-pill">
                    {publication.status === 'published' ? 'Publié' : 'Brouillon'}
                  </span>
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

<style>
  .admin-page {
    min-height: 100%;
    background: #f5f8fb;
    padding: 3rem 1rem 5rem;
  }

  .admin-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .admin-header,
  .admin-toolbar,
  .auth-card,
  .admin-lookup,
  .publication-detail {
    background: #ffffff;
    border: 1px solid #d8e8f6;
    border-radius: 8px;
    box-shadow: 0 16px 40px rgba(19, 56, 108, 0.08);
  }

  .admin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem;
  }

  .admin-kicker,
  .publication-label {
    margin: 0 0 0.25rem;
    color: #41627f;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    color: #123154;
    letter-spacing: 0;
  }

  h1 {
    font-size: 1.9rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  .admin-session {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid #d8e8f6;
    border-radius: 8px;
    color: #41627f;
  }

  .admin-session span,
  .admin-session strong {
    display: block;
  }

  .admin-session strong {
    margin-top: 0.2rem;
    color: #123154;
    font-size: 0.86rem;
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
    color: #41627f;
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
    color: #1b4f98;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
    text-align: center;
  }

  .text-button:hover,
  .asset-links button:hover {
    text-decoration: underline;
  }

  .code-label {
    display: block;
    margin-bottom: 0.7rem;
    color: #123154;
    font-size: 0.9rem;
    font-weight: 800;
  }

  .code-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .code-grid input {
    width: 100%;
    aspect-ratio: 1;
    border: 2px solid #d8e8f6;
    border-radius: 8px;
    color: #123154;
    font-size: 1.4rem;
    font-weight: 800;
    text-align: center;
  }

  .auth-confirmation,
  .auth-notice {
    display: grid;
    gap: 0.25rem;
    padding: 0.85rem 0.95rem;
    border-radius: 8px;
    background: #f1f7fd;
    color: #41627f;
    font-size: 0.9rem;
  }

  .auth-confirmation strong {
    color: #123154;
  }

  .admin-lookup {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
    padding: 1.25rem;
  }

  .admin-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
  }

  .admin-metrics {
    display: flex;
    gap: 0.75rem;
  }

  .admin-metrics div {
    min-width: 6.5rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid #d8e8f6;
    border-radius: 8px;
    background: #f9fbfd;
  }

  .admin-metrics span,
  .admin-metrics small {
    display: block;
  }

  .admin-metrics span {
    color: #123154;
    font-size: 1.35rem;
    font-weight: 800;
  }

  .admin-metrics small {
    color: #41627f;
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
    padding: 1.25rem;
  }

  .publication-detail code,
  .publication-table code {
    color: #123154;
    white-space: nowrap;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 5.5rem;
    min-height: 2rem;
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    background: #e4f6f1;
    color: #0a6d55;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .status-pill.status-draft {
    background: #fff4d7;
    color: #7b5200;
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
    color: #1b4f98;
    font: inherit;
    font-size: 0.84rem;
    font-weight: 800;
    cursor: pointer;
  }

  .asset-links button:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .publication-table {
    overflow-x: auto;
    border: 1px solid #d8e8f6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 16px 40px rgba(19, 56, 108, 0.08);
  }

  table {
    width: 100%;
    min-width: 780px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.95rem 1rem;
    border-bottom: 1px solid #e7eef5;
    text-align: left;
    vertical-align: middle;
  }

  th {
    color: #41627f;
    font-size: 0.75rem;
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
    color: #123154;
    font: inherit;
    font-weight: 800;
    text-align: left;
    cursor: pointer;
  }

  .tenant-button span {
    color: #41627f;
    font-size: 0.78rem;
    font-weight: 600;
  }

  @media (max-width: 720px) {
    .admin-header,
    .admin-toolbar,
    .publication-detail {
      align-items: stretch;
      flex-direction: column;
    }

    .admin-lookup,
    .publication-detail {
      grid-template-columns: 1fr;
    }

    .admin-session {
      align-items: stretch;
      flex-direction: column;
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
  }
</style>
