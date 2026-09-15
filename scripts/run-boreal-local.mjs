import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Front de recette distinct du serveur historique : aucun fichier de secret créé.
// Fournir uniquement les deux variables publiques Supabase via --env-file.
if (process.env.VITE_SUPABASE_URL !== 'https://xucmfdggetwxmpquqjvj.supabase.co') {
  throw new Error('Cible Supabase Boréal non qualifiée');
}
if (!process.env.VITE_SUPABASE_ANON_KEY) throw new Error('Clé publique Supabase absente');

const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  define: { 'import.meta.env.VITE_ORCHESTRATOR_URL': JSON.stringify('/api') },
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3004' },
      '/healthz': { target: 'http://127.0.0.1:3004' },
    },
  },
});
await server.listen();
server.printUrls();
