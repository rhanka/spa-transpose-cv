<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Alert,
    Button,
    Input,
  } from '@sentropic/design-system-svelte';
  import {
    fetchTenantMarketplacePublicationByTenantKey,
    fetchTenantMarketplacePublications,
    getAdminPasskeyLoginOptions,
    getAdminPasskeyRegistrationOptions,
    requestAdminAuthOtp,
    verifyAdminAuthOtp,
    verifyAdminPasskeyLogin,
    verifyAdminPasskeyRegistration,
    type AdminPasskeySessionResponse,
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

  let email = $state('');
  let otp = $state('');
  let otpChallengeId = $state('');
  let verificationToken = $state('');
  let verificationExpiresAt = $state('');
  let tenantKey = $state('');
  let adminToken = $state('');
  let adminEmail = $state('');
  let expiresAt = $state('');
  let publications = $state<TenantMarketplacePublication[]>([]);
  let selectedPublication = $state<TenantMarketplacePublication | null>(null);
  let webauthnSupported = $state(true);
  let loadingSession = $state(false);
  let loadingOtp = $state(false);
  let loadingOtpVerify = $state(false);
  let loadingRegistration = $state(false);
  let loadingPublications = $state(false);
  let loadingLookup = $state(false);
  let authNotice = $state('');
  let error = $state('');

  const publishedCount = $derived(publications.filter((publication) => publication.status === 'published').length);
  const draftCount = $derived(publications.filter((publication) => publication.status === 'draft').length);

  function storeAdminSession(session: AdminPasskeySessionResponse) {
    adminToken = session.token;
    adminEmail = session.email;
    expiresAt = session.expiresAt;
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, session.token);
    sessionStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, session.email);
  }

  function resetEnrollment() {
    otp = '';
    otpChallengeId = '';
    verificationToken = '';
    verificationExpiresAt = '';
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
      const response = await getAdminPasskeyLoginOptions(email.trim() || undefined);
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
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      error = 'Email admin requis.';
      return;
    }

    loadingOtp = true;
    error = '';
    authNotice = '';
    try {
      const response = await requestAdminAuthOtp(normalizedEmail);
      email = response.email;
      otpChallengeId = response.challengeId;
      otp = '';
      verificationToken = '';
      verificationExpiresAt = '';
      authNotice = response.delivery === 'log' && response.devOtp
        ? `Code de dev: ${response.devOtp}`
        : `Code envoyé à ${response.email}.`;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loadingOtp = false;
    }
  }

  async function handleVerifyOtp() {
    if (!otpChallengeId || !otp.trim()) {
      error = 'Code email requis.';
      return;
    }

    loadingOtpVerify = true;
    error = '';
    authNotice = '';
    try {
      const response = await verifyAdminAuthOtp(otpChallengeId, otp.trim());
      email = response.email;
      verificationToken = response.verificationToken;
      verificationExpiresAt = response.expiresAt;
      authNotice = 'Email validé.';
    } catch (err) {
      error = (err as Error).message;
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

  function handleLogout() {
    adminToken = '';
    adminEmail = '';
    expiresAt = '';
    publications = [];
    selectedPublication = null;
    tenantKey = '';
    authNotice = '';
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
          <span>{adminEmail || 'Session'}</span>
          <strong>{expiresAt ? new Date(expiresAt).toLocaleString('fr-CA') : 'active'}</strong>
        </div>
      {/if}
    </header>

    {#if error}
      <Alert tone="error" title="Erreur" message={error} />
    {/if}

    {#if !adminToken}
      <div class="admin-auth-panel">
        <div class="auth-column">
          <p class="admin-kicker">Accès admin</p>
          <h2>Passkey</h2>
          <Input
            id="admin-email-login"
            type="email"
            label="Email admin"
            bind:value={email}
            placeholder="admin@example.com"
          />
          <Button variant="primary" onclick={handlePasskeyLogin} disabled={loadingSession || !webauthnSupported}>
            {loadingSession ? 'Connexion...' : 'Se connecter'}
          </Button>
        </div>

        <div class="auth-column">
          <p class="admin-kicker">Enrôlement</p>
          <h2>OTP email</h2>
          <div class="admin-auth-row">
            <Input
              id="admin-email-otp"
              type="email"
              label="Email admin"
              bind:value={email}
              placeholder="admin@example.com"
            />
            <Button variant="secondary" onclick={handleRequestOtp} disabled={loadingOtp}>
              {loadingOtp ? 'Envoi...' : 'Recevoir le code'}
            </Button>
          </div>

          {#if otpChallengeId}
            <div class="admin-auth-row">
              <Input
                id="admin-otp"
                type="text"
                label="Code email"
                bind:value={otp}
                placeholder="123456"
              />
              <Button variant="secondary" onclick={handleVerifyOtp} disabled={loadingOtpVerify}>
                {loadingOtpVerify ? 'Validation...' : 'Valider'}
              </Button>
            </div>
          {/if}

          {#if verificationToken}
            <div class="admin-auth-actions">
              <Button variant="primary" onclick={handleRegisterPasskey} disabled={loadingRegistration || !webauthnSupported}>
                {loadingRegistration ? 'Enregistrement...' : 'Enregistrer la passkey'}
              </Button>
              {#if verificationExpiresAt}
                <span>{new Date(verificationExpiresAt).toLocaleString('fr-CA')}</span>
              {/if}
            </div>
          {/if}
        </div>

        {#if authNotice}
          <p class="auth-notice">{authNotice}</p>
        {/if}
        {#if !webauthnSupported}
          <p class="auth-warning">Passkeys non supportées par ce navigateur.</p>
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
          <Button variant="secondary" onclick={handleLogout}>Fermer</Button>
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
            <a href={selectedPublication.assets.manifestUrl} target="_blank" rel="noreferrer">manifest</a>
            <a href={selectedPublication.assets.baseDocxUrl} target="_blank" rel="noreferrer">base.docx</a>
            <a href={selectedPublication.assets.brandUrl} target="_blank" rel="noreferrer">brand</a>
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
                  <a href={publication.assets.manifestUrl} target="_blank" rel="noreferrer">manifest</a>
                  <a href={publication.assets.baseDocxUrl} target="_blank" rel="noreferrer">docx</a>
                  <a href={publication.assets.brandUrl} target="_blank" rel="noreferrer">brand</a>
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
  .admin-auth-panel,
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
    min-width: 12rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid #d8e8f6;
    border-radius: 8px;
    color: #41627f;
    text-align: right;
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

  .admin-auth-panel {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
    gap: 1.25rem;
    padding: 1.25rem;
  }

  .auth-column {
    display: grid;
    gap: 0.9rem;
    align-content: start;
  }

  .auth-column + .auth-column {
    padding-left: 1.25rem;
    border-left: 1px solid #d8e8f6;
  }

  .admin-auth-row,
  .admin-lookup {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
  }

  .admin-lookup {
    padding: 1.25rem;
  }

  .admin-auth-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
  }

  .admin-auth-actions span,
  .auth-notice,
  .auth-warning {
    margin: 0;
    color: #41627f;
    font-size: 0.84rem;
    font-weight: 700;
  }

  .auth-notice,
  .auth-warning {
    grid-column: 1 / -1;
    padding: 0.8rem 0.9rem;
    border-radius: 8px;
    background: #f1f7fd;
  }

  .auth-warning {
    background: #fff4d7;
    color: #7b5200;
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

  .asset-links a {
    color: #1b4f98;
    font-size: 0.84rem;
    font-weight: 800;
    text-decoration: none;
  }

  .asset-links a:hover {
    text-decoration: underline;
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

    .admin-auth-panel,
    .admin-auth-row,
    .admin-lookup,
    .publication-detail {
      grid-template-columns: 1fr;
    }

    .auth-column + .auth-column {
      padding-left: 0;
      padding-top: 1.25rem;
      border-left: 0;
      border-top: 1px solid #d8e8f6;
    }

    .admin-session {
      text-align: left;
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
