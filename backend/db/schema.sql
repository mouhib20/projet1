-- Structure de la base (sans données). Généré par db/export-schema.js — ne pas modifier à la main.
-- À exécuter une seule fois sur une base vide (Supabase : SQL Editor).

CREATE SEQUENCE IF NOT EXISTS article_id_article_seq;
CREATE SEQUENCE IF NOT EXISTS caisse_mouvement_id_seq;
CREATE SEQUENCE IF NOT EXISTS caisse_session_id_seq;
CREATE SEQUENCE IF NOT EXISTS charge_id_charge_seq;
CREATE SEQUENCE IF NOT EXISTS client_id_client_seq;
CREATE SEQUENCE IF NOT EXISTS client_depot_id_depot_seq;
CREATE SEQUENCE IF NOT EXISTS client_solde_usage_id_seq;
CREATE SEQUENCE IF NOT EXISTS facture_achat_id_facture_seq;
CREATE SEQUENCE IF NOT EXISTS fournisseur_id_fournisseur_seq;
CREATE SEQUENCE IF NOT EXISTS mouvement_achat_id_mouvement_seq;
CREATE SEQUENCE IF NOT EXISTS paiement_fournisseur_id_seq;
CREATE SEQUENCE IF NOT EXISTS products_id_seq;
CREATE SEQUENCE IF NOT EXISTS reparation_id_reparation_seq;
CREATE SEQUENCE IF NOT EXISTS reparation_item_id_reparation_item_seq;
CREATE SEQUENCE IF NOT EXISTS retour_fournisseur_id_seq;
CREATE SEQUENCE IF NOT EXISTS sav_accessoire_id_seq;
CREATE SEQUENCE IF NOT EXISTS stock_id_stock_seq;
CREATE SEQUENCE IF NOT EXISTS utilisateurs_id_seq;
CREATE SEQUENCE IF NOT EXISTS vente_id_vente_seq;

CREATE TABLE IF NOT EXISTS "article" (
  "id_article" integer DEFAULT nextval('article_id_article_seq'::regclass) NOT NULL,
  "designation" character varying(255) NOT NULL,
  "prix_achat" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "prix_vente" numeric(10,2) DEFAULT '0'::numeric,
  "barcode" character varying(100),
  "marque" character varying(150),
  "modele" character varying(150),
  "type" character varying(20) DEFAULT 'part'::character varying,
  "sous_categorie" character varying(100),
  "quantite" integer DEFAULT 0 NOT NULL,
  "qte_min" integer DEFAULT 3,
  "description" text,
  "image" character varying(255),
  CONSTRAINT "PK_c726e79e438d70a3b944687b642" PRIMARY KEY (id_article)
);

CREATE TABLE IF NOT EXISTS "caisse_mouvement" (
  "id" integer DEFAULT nextval('caisse_mouvement_id_seq'::regclass) NOT NULL,
  "id_session" integer,
  "type" character varying(10) NOT NULL,
  "source" character varying(20) NOT NULL,
  "montant" numeric(12,3) NOT NULL,
  "motif" character varying(255) NOT NULL,
  "reference" character varying(100),
  "avant_ouverture" boolean DEFAULT false NOT NULL,
  "par_id" integer,
  "par_nom" character varying(150) NOT NULL,
  "cree_le" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "caisse_mouvement_pkey" PRIMARY KEY (id),
  CONSTRAINT "caisse_mouvement_montant_check" CHECK ((montant > (0)::numeric)),
  CONSTRAINT "caisse_mouvement_type_check" CHECK (((type)::text = ANY ((ARRAY['entree'::character varying, 'sortie'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS "caisse_session" (
  "id" integer DEFAULT nextval('caisse_session_id_seq'::regclass) NOT NULL,
  "statut" character varying(10) DEFAULT 'ouverte'::character varying NOT NULL,
  "ouvert_par_id" integer,
  "ouvert_par_nom" character varying(150) NOT NULL,
  "ouvert_le" timestamp with time zone DEFAULT now() NOT NULL,
  "fond_attendu_ouverture" numeric(12,3) DEFAULT 0 NOT NULL,
  "fond_ouverture" numeric(12,3) DEFAULT 0 NOT NULL,
  "ferme_par_id" integer,
  "ferme_par_nom" character varying(150),
  "ferme_le" timestamp with time zone,
  "montant_attendu" numeric(12,3),
  "montant_compte" numeric(12,3),
  "ecart" numeric(12,3),
  "fond_laisse" numeric(12,3),
  "note" text,
  CONSTRAINT "caisse_session_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "charge" (
  "id_charge" integer DEFAULT nextval('charge_id_charge_seq'::regclass) NOT NULL,
  "description" character varying(255) NOT NULL,
  "montant" numeric(10,2) NOT NULL,
  "date_charge" date NOT NULL,
  "paye_caisse" boolean DEFAULT false NOT NULL,
  "type_depense" character varying(12) DEFAULT 'mensuelle'::character varying NOT NULL,
  CONSTRAINT "PK_0e773676ae7c71a89e78bf35a57" PRIMARY KEY (id_charge)
);

CREATE TABLE IF NOT EXISTS "client" (
  "id_client" integer DEFAULT nextval('client_id_client_seq'::regclass) NOT NULL,
  "nom" character varying(255) NOT NULL,
  "telephone" character varying(50),
  "solde" numeric(10,2) DEFAULT 0 NOT NULL,
  CONSTRAINT "PK_83f4571a0e37e3822fff36d6b8a" PRIMARY KEY (id_client)
);

CREATE TABLE IF NOT EXISTS "client_depot" (
  "id_depot" integer DEFAULT nextval('client_depot_id_depot_seq'::regclass) NOT NULL,
  "montant" numeric(10,2) NOT NULL,
  "date" date NOT NULL,
  "note" character varying(255),
  "id_client" integer NOT NULL,
  CONSTRAINT "client_depot_pkey" PRIMARY KEY (id_depot)
);

CREATE TABLE IF NOT EXISTS "client_solde_usage" (
  "id" integer DEFAULT nextval('client_solde_usage_id_seq'::regclass) NOT NULL,
  "id_client" integer NOT NULL,
  "montant" numeric(10,2) NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  CONSTRAINT "client_solde_usage_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "facture_achat" (
  "id_facture" integer DEFAULT nextval('facture_achat_id_facture_seq'::regclass) NOT NULL,
  "reference" character varying(150) NOT NULL,
  "date_facture" date NOT NULL,
  "total_ht" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "total_tva" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "remise" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "net_a_payer" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "montant_paye" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "reste_a_payer" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "id_fournisseur" integer,
  CONSTRAINT "PK_43383a64d9612cc79082d3a4d46" PRIMARY KEY (id_facture)
);

CREATE TABLE IF NOT EXISTS "fournisseur" (
  "id_fournisseur" integer DEFAULT nextval('fournisseur_id_fournisseur_seq'::regclass) NOT NULL,
  "nom" character varying(255) NOT NULL,
  "prenom" character varying(255),
  "tel" character varying(50),
  "entreprise" character varying(255),
  "adresse" character varying(255),
  "matricule_fiscal" character varying(100),
  "rib" character varying(100),
  "type_articles" character varying(255),
  "solde" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  CONSTRAINT "PK_bfa469e6cea941d74e411215894" PRIMARY KEY (id_fournisseur)
);

CREATE TABLE IF NOT EXISTS "fournisseur_articles" (
  "fournisseurId_fournisseur" integer NOT NULL,
  "articleId_article" integer NOT NULL,
  CONSTRAINT "fournisseur_articles_pkey" PRIMARY KEY ("fournisseurId_fournisseur", "articleId_article")
);

CREATE TABLE IF NOT EXISTS "mouvement_achat" (
  "id_mouvement" integer DEFAULT nextval('mouvement_achat_id_mouvement_seq'::regclass) NOT NULL,
  "qte" integer NOT NULL,
  "prix" numeric(10,2) NOT NULL,
  "date_mouvement" date NOT NULL,
  "id_article" integer,
  "id_fournisseur" integer,
  "id_facture" integer,
  CONSTRAINT "PK_c480c44fed9275db34550eab823" PRIMARY KEY (id_mouvement)
);

CREATE TABLE IF NOT EXISTS "paiement_fournisseur" (
  "id" integer DEFAULT nextval('paiement_fournisseur_id_seq'::regclass) NOT NULL,
  "id_fournisseur" integer NOT NULL,
  "montant" numeric(12,3) NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "note" character varying(255),
  "paye_caisse" boolean DEFAULT false NOT NULL,
  "par_nom" character varying(150) DEFAULT 'Système'::character varying NOT NULL,
  "cree_le" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "paiement_fournisseur_pkey" PRIMARY KEY (id),
  CONSTRAINT "paiement_fournisseur_montant_check" CHECK ((montant > (0)::numeric))
);

CREATE TABLE IF NOT EXISTS "products" (
  "id" integer DEFAULT nextval('products_id_seq'::regclass) NOT NULL,
  "name" character varying(255) NOT NULL,
  "description" text,
  "price" numeric(12,3) DEFAULT '0'::numeric NOT NULL,
  "barcode" character varying(100),
  "part_brand" character varying(150),
  "part_model" character varying(150),
  "quantity" integer DEFAULT 0 NOT NULL,
  "purchase_price" numeric(12,3) DEFAULT '0'::numeric NOT NULL,
  "type" character varying(20) DEFAULT 'part'::character varying NOT NULL,
  "sub_category" character varying(100),
  "min_quantity" integer DEFAULT 3 NOT NULL,
  "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
  CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "reparation" (
  "id_reparation" integer DEFAULT nextval('reparation_id_reparation_seq'::regclass) NOT NULL,
  "appareil" character varying(255),
  "description" text,
  "cout_main_oeuvre" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "prix" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "statut" character varying(50) DEFAULT 'En attente'::character varying NOT NULL,
  "date_reception" date,
  "id_client" integer,
  "montant_recu" numeric(10,2),
  "acompte" numeric(10,2) DEFAULT 0 NOT NULL,
  "retour_de" integer,
  "degre_dommage" character varying(20),
  CONSTRAINT "PK_af544ce819a9d5bab5f04c7a72e" PRIMARY KEY (id_reparation)
);

CREATE TABLE IF NOT EXISTS "reparation_item" (
  "id_reparation_item" integer DEFAULT nextval('reparation_item_id_reparation_item_seq'::regclass) NOT NULL,
  "qte" integer DEFAULT 1 NOT NULL,
  "prix" numeric(10,2) DEFAULT '0'::numeric NOT NULL,
  "id_reparation" integer,
  "id_article" integer,
  CONSTRAINT "PK_6a2381a0155ab21a0775b290878" PRIMARY KEY (id_reparation_item)
);

CREATE TABLE IF NOT EXISTS "retour_fournisseur" (
  "id" integer DEFAULT nextval('retour_fournisseur_id_seq'::regclass) NOT NULL,
  "id_article" integer NOT NULL,
  "id_fournisseur" integer,
  "qte" integer DEFAULT 1 NOT NULL,
  "probleme" text NOT NULL,
  "date_retour" date DEFAULT CURRENT_DATE NOT NULL,
  CONSTRAINT "retour_fournisseur_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "sav_accessoire" (
  "id" integer DEFAULT nextval('sav_accessoire_id_seq'::regclass) NOT NULL,
  "id_article" integer NOT NULL,
  "id_client" integer,
  "qte" integer DEFAULT 1 NOT NULL,
  "probleme" text NOT NULL,
  "degre_dommage" character varying(20),
  "statut" character varying(20) DEFAULT 'En attente'::character varying NOT NULL,
  "id_article_remplacement" integer,
  "date_retour" date DEFAULT CURRENT_DATE NOT NULL,
  CONSTRAINT "sav_accessoire_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "stock" (
  "id_stock" integer DEFAULT nextval('stock_id_stock_seq'::regclass) NOT NULL,
  "emplacement" character varying(150) NOT NULL,
  "qte_restante" integer DEFAULT 0 NOT NULL,
  "id_mouvement" integer,
  CONSTRAINT "REL_5f9d3bb85fdd79153d0f85bac3" UNIQUE (id_mouvement),
  CONSTRAINT "PK_303f56a37374ad6eaec00b3ecee" PRIMARY KEY (id_stock)
);

CREATE TABLE IF NOT EXISTS "utilisateurs" (
  "id" integer DEFAULT nextval('utilisateurs_id_seq'::regclass) NOT NULL,
  "username" character varying NOT NULL,
  "nom" character varying NOT NULL,
  "password" character varying NOT NULL,
  "role" character varying DEFAULT 'visiteur'::character varying NOT NULL,
  CONSTRAINT "UQ_202e0806bbcbef48ecb4cb73435" UNIQUE (username),
  CONSTRAINT "PK_d3c39b551c51a0bdc76e07b9197" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "vente" (
  "id_vente" integer DEFAULT nextval('vente_id_vente_seq'::regclass) NOT NULL,
  "designation" character varying(255),
  "qte" integer DEFAULT 1 NOT NULL,
  "prix" numeric(10,2) NOT NULL,
  "date" date NOT NULL,
  "id_client" integer,
  "id_article" integer,
  CONSTRAINT "PK_fc0f489f2ae4cc4d065c2f24228" PRIMARY KEY (id_vente)
);

ALTER SEQUENCE article_id_article_seq OWNED BY "article"."id_article";
ALTER SEQUENCE caisse_mouvement_id_seq OWNED BY "caisse_mouvement"."id";
ALTER SEQUENCE caisse_session_id_seq OWNED BY "caisse_session"."id";
ALTER SEQUENCE charge_id_charge_seq OWNED BY "charge"."id_charge";
ALTER SEQUENCE client_id_client_seq OWNED BY "client"."id_client";
ALTER SEQUENCE client_depot_id_depot_seq OWNED BY "client_depot"."id_depot";
ALTER SEQUENCE client_solde_usage_id_seq OWNED BY "client_solde_usage"."id";
ALTER SEQUENCE facture_achat_id_facture_seq OWNED BY "facture_achat"."id_facture";
ALTER SEQUENCE fournisseur_id_fournisseur_seq OWNED BY "fournisseur"."id_fournisseur";
ALTER SEQUENCE mouvement_achat_id_mouvement_seq OWNED BY "mouvement_achat"."id_mouvement";
ALTER SEQUENCE paiement_fournisseur_id_seq OWNED BY "paiement_fournisseur"."id";
ALTER SEQUENCE products_id_seq OWNED BY "products"."id";
ALTER SEQUENCE reparation_id_reparation_seq OWNED BY "reparation"."id_reparation";
ALTER SEQUENCE reparation_item_id_reparation_item_seq OWNED BY "reparation_item"."id_reparation_item";
ALTER SEQUENCE retour_fournisseur_id_seq OWNED BY "retour_fournisseur"."id";
ALTER SEQUENCE sav_accessoire_id_seq OWNED BY "sav_accessoire"."id";
ALTER SEQUENCE stock_id_stock_seq OWNED BY "stock"."id_stock";
ALTER SEQUENCE utilisateurs_id_seq OWNED BY "utilisateurs"."id";
ALTER SEQUENCE vente_id_vente_seq OWNED BY "vente"."id_vente";

DO $$ BEGIN ALTER TABLE "caisse_mouvement" ADD CONSTRAINT "caisse_mouvement_id_session_fkey" FOREIGN KEY (id_session) REFERENCES caisse_session(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "client_depot" ADD CONSTRAINT "client_depot_id_client_fkey" FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "facture_achat" ADD CONSTRAINT "FK_dc4f4d6ba75c2b256e3f18935ee" FOREIGN KEY (id_fournisseur) REFERENCES fournisseur(id_fournisseur) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "fournisseur_articles" ADD CONSTRAINT "fournisseur_articles_article_fk" FOREIGN KEY ("articleId_article") REFERENCES article(id_article) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "fournisseur_articles" ADD CONSTRAINT "fournisseur_articles_fournisseur_fk" FOREIGN KEY ("fournisseurId_fournisseur") REFERENCES fournisseur(id_fournisseur) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mouvement_achat" ADD CONSTRAINT "FK_87da782dc36563646b3aaa033d9" FOREIGN KEY (id_article) REFERENCES article(id_article) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mouvement_achat" ADD CONSTRAINT "FK_a38dc1f2eefaad21e3dc18518b8" FOREIGN KEY (id_facture) REFERENCES facture_achat(id_facture) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "mouvement_achat" ADD CONSTRAINT "FK_e8c20e64d4fcc127787ea091ac6" FOREIGN KEY (id_fournisseur) REFERENCES fournisseur(id_fournisseur) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "paiement_fournisseur" ADD CONSTRAINT "paiement_fournisseur_id_fournisseur_fkey" FOREIGN KEY (id_fournisseur) REFERENCES fournisseur(id_fournisseur); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "reparation" ADD CONSTRAINT "FK_5ad82795a2b5eed76daf83b01f7" FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "reparation_item" ADD CONSTRAINT "FK_d9906d3344d76d232d0990c65be" FOREIGN KEY (id_reparation) REFERENCES reparation(id_reparation) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "reparation_item" ADD CONSTRAINT "FK_faf817c0713c4c721ee16b0c28c" FOREIGN KEY (id_article) REFERENCES article(id_article) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "stock" ADD CONSTRAINT "FK_5f9d3bb85fdd79153d0f85bac33" FOREIGN KEY (id_mouvement) REFERENCES mouvement_achat(id_mouvement) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "vente" ADD CONSTRAINT "FK_320c5029e9b9ecc5da06aa6a2be" FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "vente" ADD CONSTRAINT "FK_c98dfe2c10ed11fe262995cd455" FOREIGN KEY (id_article) REFERENCES article(id_article) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS caisse_mouvement_date ON caisse_mouvement USING btree (cree_le);
CREATE INDEX IF NOT EXISTS caisse_mouvement_session ON caisse_mouvement USING btree (id_session);
CREATE UNIQUE INDEX IF NOT EXISTS caisse_session_une_ouverte ON caisse_session USING btree ((1)) WHERE ((statut)::text = 'ouverte'::text);
CREATE INDEX IF NOT EXISTS paiement_fournisseur_four ON paiement_fournisseur USING btree (id_fournisseur);
