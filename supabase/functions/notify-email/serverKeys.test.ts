import {
    notifyEmailCallerKey,
    resolveNotifyEmailServerKeys,
} from './serverKeys.ts';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

Deno.test('préfère une nouvelle clé et accepte les deux clés pendant la coexistence', () => {
    const keys = resolveNotifyEmailServerKeys({
        SUPABASE_SECRET_KEYS: JSON.stringify({ orchestrator: 'sb_secret_new' }),
        SUPABASE_SERVICE_ROLE_KEY: 'legacy',
    });
    assert(keys?.adminKey === 'sb_secret_new', 'la nouvelle clé doit être prioritaire');
    assert(keys.callerKeys.has('sb_secret_new'), 'la nouvelle clé doit être autorisée');
    assert(keys.callerKeys.has('legacy'), 'la clé legacy doit rester autorisée pendant la coexistence');
});

Deno.test('échoue fermé si le JSON des nouvelles clés est invalide', () => {
    const keys = resolveNotifyEmailServerKeys({
        SUPABASE_SECRET_KEYS: '{invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy',
    });
    assert(keys === null, 'un inventaire invalide ne doit pas retomber silencieusement sur legacy');
});

Deno.test('lit apikey puis Bearer legacy', () => {
    assert(notifyEmailCallerKey(new Headers({ apikey: 'sb_secret_new' })) === 'sb_secret_new', 'apikey invalide');
    assert(notifyEmailCallerKey(new Headers({ authorization: 'Bearer legacy' })) === 'legacy', 'Bearer invalide');
});
