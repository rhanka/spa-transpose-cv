# transpose-cv on k8s `poc`

Manifests for the FinOps migration from Scaleway Serverless Containers to the shared `poc` Kubernetes cluster.

## Platform-owned prerequisites

The `poc-k8s` lane owns:

- namespace `transpose-cv`
- ResourceQuota / LimitRange / default-deny NetworkPolicy
- namespace-scoped ServiceAccount + kubeconfig (`KUBE_CONFIG_DATA` GitHub secret)
- SCR registry `rg.fr-par.scw.cloud/transpose-cv`
- image pull secret `transpose-cv-registry`
- DNS record for `transpose-cv.sent-tech.ca`
- cert-manager DNS-01 issuer used by the Ingress

## Application shape

- UI: SvelteKit static build served by nginx on port `5173`
- API: Node/Hono on port `8686`, health endpoint `/api/health`
- Ingress: one host, `https://transpose-cv.sent-tech.ca`
  - `/api` -> `transpose-cv-api:8686`
  - `/` -> `transpose-cv-ui:5173`
- No DB.
- No PVC. Runtime tenant/config/template storage is S3/Object Storage via `TENANT_STORAGE_BACKEND=s3`.
- API uses in-memory `emptyDir` mounts for native tool scratch space:
  - `/tmp`: 1 GiB
  - `/var/tmp`: 256 MiB

## Images

Pin images by commit SHA; do not deploy `latest`:

```text
rg.fr-par.scw.cloud/transpose-cv/transpose-cv-api:<sha>
rg.fr-par.scw.cloud/transpose-cv/transpose-cv-ui:<sha>
```

Update tags before applying:

```bash
kubectl -n transpose-cv kustomize k8s \
  | sed "s/REPLACE_WITH_GIT_SHA/${GITHUB_SHA:-$(git rev-parse --short HEAD)}/g" \
  | kubectl apply -f -
```

Or use kustomize image setters in CI.

## Secrets

`secret.example.yaml` documents the expected Kubernetes Secret shape. Do not commit real values.

Required for normal production use:

- `ANTHROPIC_API_KEY` (the default `LLM_PROVIDER` in `config.yaml` is `anthropic`)
- `TENANT_S3_ACCESS_KEY`
- `TENANT_S3_SECRET_KEY`
- admin auth values: `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`, `ADMIN_SEED_SECRET`
- SMTP values if email flows are enabled

Create/update the secret from CI or a private operator command before rollout.

## Apply order

After platform provisioning is complete:

1. Create `transpose-cv-api-secrets` from private values.
2. Build and push both images to SCR with the same git SHA tag.
3. Apply these manifests.
4. Wait for rollout:

```bash
kubectl -n transpose-cv rollout status deploy/transpose-cv-api
kubectl -n transpose-cv rollout status deploy/transpose-cv-ui
kubectl -n transpose-cv get ingress transpose-cv
```

5. Ask platform lane to validate DNS `A` record and HTTPS.
6. Only after k8s is green, decommission the legacy Scaleway Serverless Container.

## Scale-to-zero note

`scale-to-zero.yaml` contains the intended KEDA HTTP add-on resources for the UI route, but it is **not** included in `kustomization.yaml` yet. The namespace-scoped CI kubeconfig must first be allowed to manage `HTTPScaledObject` resources, or the platform lane must apply that manifest.

Until then, Ingress `/` routes directly to `transpose-cv-ui` so the initial k8s cut-over can complete. The API stays at one replica for the first cut-over because `/api` requests can be long-running and provider-backed. Avoid any external prober on `transpose-cv.sent-tech.ca`; otherwise the UI route will never scale down to zero once KEDA is enabled.
