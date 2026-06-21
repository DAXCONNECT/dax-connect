# Dax Connect — Guide du projet

## Stack technique (version production)
- Frontend : Next.js
- Backend/DB : Supabase
- Hébergement : Vercel
- Médias : Cloudflare R2

## Fichiers du projet

### dax-connect.html
Le prototype complet fonctionnel. Ouvre directement dans un navigateur.
Pour que l'autocomplétion d'adresse fonctionne en local, lance un serveur :
```
npx serve .
```
Ou installe l'extension "Live Server" dans VS Code et clique "Go Live".

## Fonctionnalités implémentées dans le proto

### Inscription
- Vérification prénom via IA (API Anthropic)
- Prénom : 1ère lettre majuscule automatique
- Nom : MAJUSCULES automatiques
- Adresse vérifiée via API BAN État français (citycode=40100)
- Refus si adresse hors Dax
- Device fingerprint SHA-256 anti-doublon
- Photo de profil avec compression automatique (< 50ko)

### Feed
- 9 catégories de posts
- Sondages intégrés
- Vérification IA des photos (Anthropic Vision)
- Correction orthographe IA
- Suppression auto posts : 30 jours / événements le lendemain
- Mode visiteur (lecture seule)
- Quartier affiché, adresse jamais visible

### Système de rôles
- Créateur (toi) : accès total
- Admin (nommés par toi) : modération
- Membre : utilisation normale

### Modération
- Suspension : 24h / 3 jours / 1 semaine
- Exclusion définitive
- Journal de modération

### Tableau de bord Créateur
- Stats temps réel
- Publication officielle + génération IA
- Message de bienvenue 1 clic
- Visible UNIQUEMENT par le Créateur

## APIs utilisées

### API BAN (Base Adresse Nationale)
```
https://api-adresse.data.gouv.fr/search/?q=ADRESSE&citycode=40100&limit=7&type=housenumber
```
Gratuite, pas de clé nécessaire. Ne fonctionne pas en file:// local (CORS).

### API Anthropic (Claude)
```
https://api.anthropic.com/v1/messages
```
Utilisée pour :
- Vérification prénom
- Vérification contenu photos
- Correction orthographe
- Génération messages officiels

La clé API est gérée par Claude.ai dans le proto.
En production, mettre la clé dans une variable d'environnement côté serveur :
```
ANTHROPIC_API_KEY=sk-ant-...
```
Ne jamais exposer la clé côté client en production.

## Pour tester en local

1. Télécharge dax-connect.html
2. Dans VS Code, installe l'extension "Live Server"
3. Clic droit sur le fichier > "Open with Live Server"
4. L'autocomplétion d'adresse fonctionnera

OU via terminal :
```bash
npx serve .
# Ouvre http://localhost:3000/dax-connect.html
```

## Comptes de démo (dans le proto)
- **Créateur** : Gilles LARRIEU — accès total + tableau de bord
- **Admin** : Marie DUPONT — modération
- **Membre** : Paul RENAUD — utilisation normale

## Prochaines étapes production

1. Créer un projet Supabase (supabase.com)
2. Configurer l'auth Supabase
3. Créer les tables (users, posts, comments, messages, mod_log)
4. Créer un bucket Cloudflare R2 pour les médias
5. Déployer sur Vercel
6. Brancher le domaine daxconnect.fr (ou .com)
