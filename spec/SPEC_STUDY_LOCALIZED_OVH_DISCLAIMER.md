# Study: OVH disclaimer language

## Context

- The application UI declares French as its language and presents its navigation and footer in French.
- The disclaimer was the exception: it was entirely in English and stated that data was stored on Scaleway in Paris.
- Runtime processing and temporary hosting now occur on OVHcloud Managed Kubernetes in Canada.

## Direction

- D1: Present the entire disclaimer in French now, including the title, explanatory copy, every bullet, the liability notice, and the acceptance button.
- D2: Describe CV processing and temporary hosting on OVHcloud in Canada. Keep the existing AI-provider processing-location list.
- D3: Limit the 48-hour retention statement to CVs and generated documents, which matches the session lifecycle.
- D4: Version the local acceptance value so that users who accepted the former notice see the updated notice.

## Non-goal

Global English/French localisation is a separate evolution. The current application has no language-selection or translation system, so this change does not introduce one for a single component.

## Verification

- `npm --workspace ui run check`
- Static check that the disclaimer contains the OVH statement and no longer contains the former Scaleway or English notice text.
