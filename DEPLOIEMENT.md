# Publier une version d'essai en ligne (Render, un seul compte)

Un seul service **Render** sert le site **et** l'API à la même adresse, avec sa propre base PostgreSQL
gratuite. Au premier démarrage, les tables et le compte `admin` sont créés automatiquement.

## Les étapes

1. **Compte Render** : sur render.com, cliquez **Get Started** puis **GitHub** (connexion avec votre compte GitHub).
   Autorisez Render à lire le dépôt `mouhib20/projet1`.
2. **New + > Blueprint**, choisissez le dépôt `projet1` : Render lit `render.yaml` et prépare le service
   `gsmpro` et la base `gsmpro-db`.
3. Render demande **une seule valeur** : `SEED_ADMIN_PASSWORD`. C'est le mot de passe du compte
   `admin` : choisissez-en un solide (10 caractères minimum) et gardez-le. Cliquez **Apply**.
4. Patientez 5 à 10 minutes (compilation du site et de l'API). Quand le service est **Live**, ouvrez son adresse
   `https://gsmpro-….onrender.com`, cliquez sur la connexion et entrez `admin` + votre mot de passe.

C'est tout : il n'y a rien d'autre à configurer.

## Ajouter d'autres comptes (vendeur, visiteur…)

Sur Render : service `gsmpro` > **Environment** > ajoutez `SEED_USERS` :

```
[{"username":"vendeur1","nom":"Ahmed","password":"motdepasse-solide","role":"vendeur"}]
```

Puis **Manual Deploy > Deploy latest commit**. Rôles : `admin`, `vendeur`, `vendeuse`, `visiteur`.
Un compte qui existe déjà n'est jamais modifié.

## À savoir sur l'offre gratuite

- Le service s'endort après 15 minutes sans visite : la première page met 30 à 60 secondes à répondre.
- La base gratuite de Render est **supprimée au bout de 30 jours** (sauvegardez ce qui compte, ou passez à une offre payante).
- Les **images d'articles** envoyées sont perdues à chaque redéploiement (disque temporaire).

## Ce qui protège l'essai

- Toute l'API exige une connexion ; le rôle **visiteur** est en lecture seule ; seuls les **admins**
  modifient fournisseurs, factures d'achat et stock.
- 10 mots de passe faux de suite sur un compte le bloquent 15 minutes.
- La clé des connexions (`JWT_SECRET`) est générée par Render ; aucun mot de passe n'est dans le code.
- Ne mettez pas vos vraies données dans l'essai.

## Mettre à jour l'essai

`git push` sur le dépôt : Render recompile et redéploie tout seul.

## Autres hébergements (site et API séparés, base Supabase…)

Voir `backend/.env.example` : `DATABASE_URL` (ou `DB_HOST`…), `JWT_SECRET`, `CORS_ORIGIN` (adresse du site).
Pour le site seul : `API_URL=https://…/api node frontend/scripts/write-config.js` après la compilation.
`backend/db/schema.sql` crée les tables, `npm run db:seed` (dans `backend`) crée les comptes,
et `npm run db:schema` régénère `schema.sql` après un changement de tables.
