# Chiffrement des secrets au repos

Module centralisé : `orchestrator/src/security/crypto.ts` — `SecretCipher`
(AES-256-GCM authentifié). Format stocké : `enc:v1:<base64(iv|tag|ciphertext)>`
(versionné pour rotation d'algorithme).

## Clé
- `INTEGRATION_ENCRYPTION_KEY` : clé AES-256 en base64 (32 octets).
  Générer : `openssl rand -base64 32`. **Secret** — jamais journalisée.
- Validée au démarrage (`config/env.ts`) si présente.

## Usage
```ts
const cipher = SecretCipher.fromEnv();
const stored = cipher.encrypt(webhookUrl);   // → "enc:v1:…", à stocker
// ... plus tard, au moment de l'usage uniquement :
const url = cipher.decrypt(stored);
```
Règles : chiffrer côté serveur **avant** stockage ; déchiffrer **seulement** au
moment de l'usage ; ne jamais mettre une valeur déchiffrée dans un DTO, un log ou
une erreur. Le déchiffrement échoue (tag GCM) si le contenu a été altéré.

## Rotation de clé
1. Provisionner la nouvelle clé.
2. Re-chiffrer les valeurs existantes (lire avec l'ancienne, écrire avec la nouvelle).
3. Le préfixe versionné (`v1`) permet d'introduire `v2` sans ambiguïté.

## État du câblage (limite connue)
Aujourd'hui, les secrets d'intégration (`notificationChannels.slackWebhook`…) sont
écrits **directement par la SPA** dans `hybrid_nodes` (Supabase). Il n'existe pas
encore de **chemin d'écriture côté serveur** où chiffrer. Le primitive ci-dessus
est prêt et testé ; son branchement complet nécessite d'introduire une écriture des
nœuds passant par l'orchestrateur (ou une Edge Function) qui chiffrera avant
stockage et exposera uniquement `configured: true` (cf. DTO publics, Phase 6).
Tant que ce chemin n'existe pas, considérer le chiffrement au repos comme
**disponible mais non encore appliqué de bout en bout**.
