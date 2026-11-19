# Mise en service : comptes, bibliothèque et administration

Sans cette configuration, pdf-audio fonctionne en **mode invité** (comme avant). Elle active :
la connexion, la bibliothèque personnelle, et le tableau de bord admin avec statistiques conservées.

## 1. Mettre à jour le code

```powershell
cd "C:\Users\LENOVO 14P 001\Desktop\pdf-audio-driver"
Expand-Archive "$env:USERPROFILE\Downloads\patch-v6.zip" . -Force
cd frontend
npm install @supabase/supabase-js pdfjs-dist
cd ..
git add .
git commit -m "pdf-audio v6 : admin complet, retour au chargement"
git push
```

## 2. Créer le projet Supabase (gratuit, sans carte bancaire)

1. https://supabase.com → **Start your project** → connexion avec GitHub.
2. **New project** : nom `pdf-audio`, choisissez un mot de passe de base de données (gardez-le),
   région **Frankfurt (eu-central-1)** (la plus proche de Douala), plan **Free**.
3. Attendez ~2 minutes que le projet soit prêt.

## 3. Créer les tables

**SQL Editor → New query** : collez tout le contenu de `supabase/schema.sql`, puis **Run**.
Résultat attendu : « Success. No rows returned ».

## 4. Récupérer les clés

Dans **Project Settings → API Keys** (si besoin, cliquez sur **Create new API Keys**) :

| À copier | Où la mettre |
|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | Vercel **et** Render |
| **Publishable key** (`sb_publishable_…`) | Vercel **et** Render |
| **Secret key** (`sb_secret_…`) | **Render uniquement**. Ne la mettez jamais dans Vercel, GitHub ni le navigateur. |

Les anciennes clés `anon` et `service_role` fonctionnent aussi, mais Supabase les retire d'ici la fin de 2026.

## 5. Réglages d'authentification

**Authentication → URL Configuration** :
- **Site URL** : l'adresse de votre site (par exemple `https://pdf-audio.vercel.app`)
- **Redirect URLs** : ajoutez `https://*.vercel.app/**` et `http://localhost:3000/**`

**Authentication → Providers → Email** : laissez **Confirm email** activé (obligatoire pour la sécurité de l'accès admin).

## 6. Variables sur Render (backend)

Service → **Environment** :

| Clé | Valeur |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | clé publishable |
| `SUPABASE_SECRET_KEY` | clé secrète |
| `ADMIN_EMAILS` | **votre** adresse e-mail (plusieurs : séparées par des virgules) |

Enregistrez : Render redémarre.

## 7. Variables sur Vercel (site)

Projet → **Settings → Environment Variables** (Production) :

| Clé | Valeur |
|---|---|
| `NEXT_PUBLIC_API_URL` | adresse Render (déjà configurée) |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publishable |

Puis **Deployments → ⋯ → Redeploy** (ces variables sont intégrées à la construction du site).

## 8. Créer votre compte administrateur

1. Ouvrez le site, **Se connecter → Créer un compte** avec **l'adresse mise dans `ADMIN_EMAILS`**.
2. Confirmez l'e-mail reçu, puis connectez-vous.
3. Cliquez sur votre pastille (en haut à droite) → **Tableau de bord admin**.

Créez ce compte **en premier** : une adresse ne peut être inscrite qu'une fois. L'accès admin exige en plus
une adresse e-mail **confirmée**. Pour un verrouillage encore plus strict, ajoutez `ADMIN_USER_IDS`
(votre identifiant d'utilisateur, visible dans Supabase → Authentication → Users).

## 9. (Facultatif) Connexion avec Google

Supabase → Authentication → Providers → Google : suivez l'assistant (création d'identifiants dans Google Cloud),
puis ajoutez `NEXT_PUBLIC_GOOGLE_AUTH` = `1` sur Vercel et redéployez.

## Règle de collecte

- **Mode invité : rien n'est collecté.** Ni identifiant, ni statistique. C'est appliqué côté serveur : même un navigateur modifié ne peut pas enregistrer d'activité d'invité.
- **Compte connecté** : visites, documents chargés (**nom du fichier**, pages, taille, langue), pages écoutées, durée d'écoute, fonctions utilisées, pays approximatif, appareil, navigateur, erreurs. Jamais : contenu des documents, recherches saisies, adresse IP.
- Le consentement est demandé à l'inscription (case à cocher, date enregistrée dans le profil) et la page **Confidentialité** permet à chacun de refuser l'enregistrement de son activité.
- Le contenu des PDF conservés dans la bibliothèque reste privé : l'admin voit les noms et la progression, pas les fichiers.
- Pour compter aussi les visites des invités **sans rien collecter sur eux**, activez les statistiques anonymes de votre hébergeur (Vercel → projet → Analytics).

## Espace admin (`/admin`)

- **Vue d'ensemble** : utilisateurs actifs, inscriptions, documents, lectures, pages écoutées, parcours, fonctionnalités, pays, appareils, qualité de la voix, erreurs.
- **Utilisateurs** : liste filtrable ; clic sur une ligne = fiche (documents chargés, bibliothèque, chronologie) avec **suspension / réactivation** du compte.
- **Documents** : les derniers fichiers chargés par les comptes.
- **Activité** : flux en direct.
- **Exports CSV** (utilisateurs, documents, activité), lisibles directement dans Excel.

La suspension et la liste complète des comptes utilisent la **clé secrète** Supabase (sur Render uniquement).

## Limites des offres gratuites

- **Render** : le serveur s'endort après 15 minutes d'inactivité (réveil ~1 minute).
- **Supabase** : un projet gratuit inactif plusieurs jours est mis en pause (réactivable en un clic). Stockage : 1 Go.
- Limites anti-abus du backend (réglables par variables) : invité 8 PDF/heure par adresse IP, compte 40 PDF/heure.
