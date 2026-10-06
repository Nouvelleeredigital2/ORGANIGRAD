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

## État du câblage (audit du 23 septembre 2026)

Le chemin serveur existe désormais : `PgGraphStore` chiffre `systemPrompt`,
`mcpConfig` et `notificationChannels` avant écriture et les DTO publics
n'exposent que des indicateurs de configuration. La SPA route les mutations par
l'orchestrateur lorsqu'il est configuré et refuse le repli silencieux si ce
service devient indisponible.

La garantie reste toutefois **conditionnelle** :

- `INTEGRATION_ENCRYPTION_KEY` est optionnelle ; sans elle, `SecretCipher` est
  absent et les valeurs sont conservées en clair pour compatibilité ;
- le mode local/non connecté peut encore utiliser le repository direct ou
  `localStorage` selon l'environnement ;
- la présence de la clé et le contenu réellement stocké en production n'ont
  pas été vérifiés pendant cet audit.

Ne déclarer le chiffrement au repos validé qu'après contrôle de la configuration
de production et inspection non divulguante des valeurs stockées.
