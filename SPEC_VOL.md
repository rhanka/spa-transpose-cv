# Spec Volonté — Brute (telle que formulée par le demandeur)

> Date : 2026-03-23

Je voudrais que tu fasses tout en autonomie, jusqu'au déploiement du container SCW avec création du namespace, en t'inspirant profondément du scaffolding `../top-ai-ideas-full-stack`, et en clonant le look & feel de https://scalian.com (c'est pour Scalian qu'on fait ça), avec une SPA Svelte 5 permettant de :

- Télécharger un lot de CV
- Mettre un prompt d'orientation
- Lancer autant d'agents Claude qu'il faut en parallèle

Contraintes :
- Pas de DB, ni de S3
- La session sera identifiée par navigateur
- Les résultats purgés dans les 48h pour limiter le risque RGPD
- Partage possible du lien du batch en cours avec une URL de session pour faciliter le changement de poste de travail
- Les données seront chiffrées avec un mot de passe de session (même avec le lien, l'utilisateur devra avoir un mot de passe pour déchiffrer)
- Au moment de l'upload, l'utilisateur doit proposer un mot de passe de chiffrement

Stack :
- Frontend : SPA Svelte 5
- Backend : TypeScript (port existant de scalian_xml.py / scalian_docx_tools.py)
- Agents : Claude API en parallèle
- Déploiement : Container Scaleway (namespace à créer)
- Référence scaffolding : ../top-ai-ideas-full-stack
- Look & feel : clone de https://scalian.com
