# Système IA

## Ce que le dépôt implémente

Organigrad orchestre des acteurs IA mais n’exécute pas directement un modèle via un SDK OpenAI, Anthropic ou équivalent.

- Les nœuds `AGENT_IA` peuvent porter un prompt système et des compétences.
- Les fiches `bot_profiles` structurent mission, personnalité, méthode, limites, sources et paramètres de modèle.
- Le prompt d’un bot est compilé côté serveur, puis son empreinte SHA-256 est calculée.
- Le bundle Hermès exporte les bots activés et leurs prompts compilés.
- Les appels effectifs sont délégués à des serveurs MCP, au runtime Hermès ou à des services Engine/Orvion.
- La validation humaine et les scopes restent autoritaires autour des sorties IA.

## Modèles et fournisseurs

Les champs `provider`, `model` et `temperature` sont des données de configuration de bot. Les valeurs par défaut observées mentionnent `ollama-cloud` et `gpt-oss:120b`, mais le dépôt ne contient ni client LLM correspondant ni preuve d’exécution de ces modèles.

## Prompts et secrets

- Le prompt compilé des bots est dérivé côté serveur et n’est pas accepté comme autorité depuis le client.
- `systemPrompt`, `mcpConfig` et canaux de notification peuvent être chiffrés dans le chemin orchestrateur si `INTEGRATION_ENCRYPTION_KEY` est configurée.
- Sans cette clé, le code conserve un mode compatible en clair. La production n’a pas été contrôlée aujourd’hui.

## Gestion des erreurs

Les clients MCP/Engine/Orvion ont des validations, timeouts et erreurs testées. Les circuits enregistrent des empreintes, tentatives et reçus pour éviter les doubles effets. Les sorties réelles de modèles, leur qualité et leur coût ne sont pas évalués dans ce dépôt.

## RAG

Aucun upload documentaire, extraction, chunking, embedding, index vectoriel, retrieval ou citation n’a été trouvé. Il n’existe donc pas de système RAG à documenter ou à valider ici.

