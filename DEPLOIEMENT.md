# Publier une version d'essai en ligne

Le projet est prêt pour : **Supabase** (base de données) + **Render** (API et site). Les deux ont une offre
gratuite suffisante pour un essai.

> **Important : utilisez une base NEUVE pour l'essai.** N'y mettez pas vos vraies données (clients, ventes,
> caisse) : n'importe quelle personne qui reçoit le lien pourra créer, modifier et supprimer des données.

## 1. Créer la base d'essai (Supabase)

1. Sur supabase.com : **New project** (nom : `gsmpro-essai`). Notez le mot de passe de la base.
2. **Project Settings > Database > Connection string > Session pooler** : notez l'hôte
   (`aws-0-….pooler.supabase.com`) et l'utilisateur (`postgres.<référence-du-projet>`).
3. **SQL Editor** : collez le contenu de `backend/db/schema.sql` et cliquez **Run**. Les 20 tables sont créées.

## 2. Créer les comptes de connexion

Dans `backend/.env` (jamais sur GitHub), mettez les valeurs de la **nouvelle** base :

```
DB_HOST=aws-0-….pooler.supabase.com
DB_USERNAME=postgres.<référence>
DB_PASSWORD=<mot de passe>
DB_SSL=true
SEED_ADMIN_PASSWORD=<un mot de passe solide, 10 caractères minimum>
# facultatif : d'autres comptes
SEED_USERS=[{"username":"vendeur1","nom":"Ahmed","password":"…","role":"vendeur"}]
```

Puis : `cd backend && npm run db:seed`. Le compte **admin** existe ; rôles possibles : admin, vendeur, vendeuse, visiteur.

## 3. Mettre le code sur GitHub

Render lit le code depuis GitHub. Poussez le projet dans **un dépôt qui vous appartient**
(`git push`). Le fichier `backend/.env` n'est pas envoyé (il est ignoré par Git).

## 4. Déployer (Render)

1. Sur render.com : **New + > Blueprint**, choisissez le dépôt : `render.yaml` crée deux services,
   `gsmpro-api` et `gsmpro-app`.
2. Render demande les valeurs de l'API : `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD` (celles de la base d'essai).
   `JWT_SECRET` est généré automatiquement.
3. Quand les deux services sont créés, notez leurs adresses puis renseignez :
   - service **gsmpro-app** > Environment > `API_URL` = `https://<adresse-de-l-api>/api`
   - service **gsmpro-api** > Environment > `CORS_ORIGIN` = `https://<adresse-du-site>`
4. **Manual Deploy > Deploy latest commit** sur les deux services.
5. Ouvrez l'adresse du site et connectez-vous avec `admin`.

## À savoir sur l'offre gratuite

- L'API s'endort après 15 minutes sans visite : la première page met 30 à 60 secondes à répondre.
- Les **images d'articles** envoyées sur le site sont perdues à chaque redéploiement (disque temporaire).
- Un projet Supabase gratuit est mis en pause après 7 jours sans activité (réactivable en un clic).

## Ce qui protège l'essai

- Toute l'API exige une connexion ; le rôle **visiteur** est en lecture seule ; seuls les **admins**
  modifient fournisseurs, factures d'achat et stock.
- 10 mots de passe faux de suite sur un compte le bloquent 15 minutes.
- La clé qui signe les connexions (`JWT_SECRET`) et les mots de passe ne sont jamais dans le code.
- En production le serveur refuse de démarrer sans `JWT_SECRET`.

## Après un changement de tables

Régénérez le script de la base : `cd backend && npm run db:schema` (met à jour `db/schema.sql`).
