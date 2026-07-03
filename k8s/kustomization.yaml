apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: transpose-cv
resources:
  - config.yaml
  - api.yaml
  - ui.yaml
  - ingress.yaml
  - networkpolicy.yaml
  - scale-to-zero.yaml
images:
  - name: rg.fr-par.scw.cloud/transpose-cv/transpose-cv-api
    newTag: REPLACE_WITH_GIT_SHA
  - name: rg.fr-par.scw.cloud/transpose-cv/transpose-cv-ui
    newTag: REPLACE_WITH_GIT_SHA
