<script lang="ts">
  import { Button, Card, Checkbox, Input } from '@sentropic/design-system-svelte';
  import { createTenantViaAdmin, requestClaimOtp, type AdminTenantCreateResponse, type ClaimOtpResponse } from '$lib/api';

  let companyUrl = $state('');
  let corporateEmail = $state('');
  let showOperatorAccess = $state(false);
  let rootAdminPassword = $state('');
  let otp = $state('');
  let templateFile = $state<File | null>(null);
  let templateDragOver = $state(false);
  let loadingOtp = $state(false);
  let loadingCreate = $state(false);
  let error = $state('');
  let claim = $state<ClaimOtpResponse | null>(null);
  let created = $state<AdminTenantCreateResponse | null>(null);

  const isRootAdminMode = $derived(rootAdminPassword.trim().length > 0);

  function handleTemplateSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    applyTemplateFile(input.files?.[0] ?? null);
  }

  function applyTemplateFile(file: File | null) {
    if (!file) {
      templateFile = null;
      return;
    }

    if (!file.name.match(/\.docx$/i)) {
      error = "L'exemple doit etre fourni au format DOCX.";
      return;
    }

    error = '';
    templateFile = file;
  }

  function handleTemplateDrop(event: DragEvent) {
    event.preventDefault();
    templateDragOver = false;
    applyTemplateFile(event.dataTransfer?.files?.[0] ?? null);
  }

  function handleTemplateDragOver(event: DragEvent) {
    event.preventDefault();
    templateDragOver = true;
  }

  function handleTemplateDragLeave() {
    templateDragOver = false;
  }

  function handleOperatorAccessToggle(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    showOperatorAccess = target.checked;
    if (!showOperatorAccess) {
      rootAdminPassword = '';
    }
  }

  async function handleRequestOtp() {
    if (!companyUrl.trim() || !corporateEmail.trim()) {
      error = 'Le site de référence et l’adresse de vérification sont requis.';
      return;
    }

    loadingOtp = true;
    error = '';
    created = null;
    try {
      claim = await requestClaimOtp({
        companyUrl: companyUrl.trim(),
        corporateEmail: corporateEmail.trim(),
      });
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loadingOtp = false;
    }
  }

  async function handleCreate() {
    if (!companyUrl.trim() || !corporateEmail.trim() || !templateFile) {
      error = "Le site de reference, l'adresse de verification et l'exemple DOCX sont requis.";
      return;
    }

    if (!isRootAdminMode && (!claim?.challengeId || !otp.trim())) {
      error = 'Le code de vérification est requis.';
      return;
    }

    loadingCreate = true;
    error = '';
    try {
      created = await createTenantViaAdmin({
        companyUrl: companyUrl.trim(),
        corporateEmail: corporateEmail.trim(),
        templateFile,
        challengeId: isRootAdminMode ? undefined : claim?.challengeId,
        otp: isRootAdminMode ? undefined : otp.trim(),
        rootAdminPassword: isRootAdminMode ? rootAdminPassword.trim() : undefined,
      });
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loadingCreate = false;
    }
  }
</script>

<Card class="builder-shell">
  <div class="builder-header">
    <div>
      <h2 class="builder-title">Créer un espace CV pour votre société</h2>
      <p class="builder-copy">
        De 1h30 à 15 min par CV. Uploadez un lot, ajoutez un prompt d'orientation, et laissez l'IA
        transformer chaque profil en parallèle.
      </p>
    </div>
  </div>

  <div class="builder-grid">
    <Input
      id="builder-company-url"
      type="url"
      label="Site de référence"
      bind:value={companyUrl}
      placeholder="Ex: https://entreprise.com"
      helperText="Utilisé pour retrouver les couleurs, les polices, le logo et le fond d’accueil."
    />

    <Input
      id="builder-corporate-email"
      type="email"
      label="Adresse de vérification"
      bind:value={corporateEmail}
      placeholder="Ex: prenom.nom@entreprise.com"
      helperText="Une adresse de l’entreprise est nécessaire pour recevoir le code de vérification."
    />
  </div>

  <div class="builder-field">
      <label class="builder-label" for="builder-template-file">Exemple DOCX de l'entreprise</label>
    <input id="builder-template-file" type="file" accept=".docx" class="hidden" onchange={handleTemplateSelect} />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="builder-dropzone"
      class:builder-dropzone--active={templateDragOver}
      ondrop={handleTemplateDrop}
      ondragover={handleTemplateDragOver}
      ondragleave={handleTemplateDragLeave}
      onclick={() => document.getElementById('builder-template-file')?.click()}
      role="button"
      tabindex="0"
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          document.getElementById('builder-template-file')?.click();
        }
      }}
    >
      {#if templateFile}
        <div class="builder-dropzone-icon">&#8593;</div>
        <div class="builder-dropzone-title">{templateFile.name}</div>
        <div class="builder-dropzone-copy">Cliquez pour remplacer le document.</div>
      {:else}
        <div class="builder-dropzone-icon">&#8593;</div>
        <div class="builder-dropzone-title">Deposez l'exemple DOCX ici</div>
        <div class="builder-dropzone-copy">ou cliquez pour le sélectionner</div>
      {/if}
    </div>
    <p class="builder-help">
      Le document sert a analyser la structure cible. Format DOCX uniquement a ce stade.
    </p>
  </div>

  {#if !isRootAdminMode}
    <div class="builder-otp-row">
      <Button variant="secondary" onclick={handleRequestOtp} disabled={loadingOtp}>
        {loadingOtp ? 'Envoi du code...' : 'Envoyer le code'}
      </Button>

      <div class="builder-otp-input">
        <Input
          id="builder-otp"
          type="text"
          label="Code de vérification"
          bind:value={otp}
          placeholder="Code reçu par courriel"
        />
      </div>
    </div>
  {/if}

  <div class="builder-operator">
    <Checkbox
      id="builder-operator-toggle"
      label="Accès opérateur Sent Tech"
      checked={showOperatorAccess}
      onchange={handleOperatorAccessToggle}
    />

    {#if showOperatorAccess}
      <Input
        id="builder-root-password"
        type="password"
        label="Clé opérateur"
        bind:value={rootAdminPassword}
        placeholder="Réservé à l’équipe Sent Tech"
        helperText="Réservé à l’équipe Sent Tech."
      />
    {/if}
  </div>

  {#if claim}
    <div class="builder-status">
      <div><strong>Slug réservé :</strong> <code>{claim.slug}</code></div>
      <div><strong>Domaine :</strong> <code>{claim.companyDomain}</code></div>
      <div><strong>Expiration :</strong> {new Date(claim.expiresAt).toLocaleString('fr-CA')}</div>
      {#if claim.devOtp}
        <div><strong>Code local :</strong> <code>{claim.devOtp}</code></div>
      {/if}
    </div>
  {/if}

  {#if created}
    <div class="builder-success">
      <div><strong>Espace créé :</strong> <code>{created.slug}</code></div>
      <div><strong>Affichage :</strong> {created.displayName}</div>
      <div><strong>Famille détectée :</strong> {created.templateProfile}</div>
      <div><strong>Statut :</strong> {created.active ? 'publié' : 'brouillon'}</div>
      {#if created.active}
        <a class="builder-link" href={created.routeBase}>Ouvrir l’espace</a>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="builder-error">{error}</div>
  {/if}

  <div class="builder-actions">
    <Button variant="primary" onclick={handleCreate} disabled={loadingCreate}>
      {loadingCreate
        ? 'Création en cours...'
        : isRootAdminMode
          ? 'Créer et publier'
          : 'Créer le brouillon'}
    </Button>
  </div>
</Card>

<style>
  :global(.builder-shell) {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 2rem;
  }

  .builder-header {
    display: block;
  }

  .builder-title {
    margin: 0;
    font-size: 1.4rem;
    color: var(--color-purple-dark);
  }

  .builder-copy {
    margin: 0.45rem 0 0;
    color: var(--color-purple-light);
    line-height: 1.55;
  }

  .builder-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .builder-field {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .builder-label {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--color-purple-dark);
  }

  .builder-help {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--color-purple-light);
  }

  .builder-dropzone {
    padding: 2rem 1rem;
    border: 2px dashed var(--color-purple-border);
    border-radius: calc(var(--radius-base) * 0.85);
    background: white;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .builder-dropzone--active {
    border-color: var(--color-green);
    background: rgba(17, 196, 212, 0.03);
  }

  .builder-dropzone-icon {
    font-size: 2rem;
    line-height: 1;
    color: var(--color-purple-dark);
  }

  .builder-dropzone-title {
    margin-top: 0.65rem;
    font-size: 0.98rem;
    font-weight: 600;
    color: var(--color-purple-dark);
  }

  .builder-dropzone-copy {
    margin-top: 0.3rem;
    font-size: 0.82rem;
    color: var(--color-purple-light);
  }

  .builder-otp-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
  }

  .builder-otp-input {
    flex: 1;
  }

  .builder-status,
  .builder-success,
  .builder-error {
    padding: 1rem;
    border-radius: calc(var(--radius-base) * 0.75);
    font-size: 0.88rem;
    line-height: 1.55;
  }

  .builder-status {
    background: rgba(17, 196, 212, 0.08);
    border: 1px solid rgba(17, 196, 212, 0.18);
    color: var(--color-purple-dark);
  }

  .builder-success {
    background: rgba(17, 196, 212, 0.09);
    border: 1px solid rgba(17, 196, 212, 0.22);
    color: var(--color-purple-dark);
  }

  .builder-error {
    background: #fff1f2;
    border: 1px solid #fecdd3;
    color: #be123c;
  }

  .builder-link {
    display: inline-flex;
    margin-top: 0.4rem;
    color: var(--color-green);
    font-weight: 700;
  }

  .builder-operator {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .builder-actions {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 768px) {
    .builder-otp-row {
      flex-direction: column;
      align-items: stretch;
    }

    .builder-grid {
      grid-template-columns: 1fr;
    }

    .builder-actions {
      justify-content: stretch;
    }
  }
</style>
