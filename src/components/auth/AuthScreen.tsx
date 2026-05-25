import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Button, FormField, Input, Surface } from '../../design/ui';

/**
 * Écran d'authentification — email + mot de passe + magic link.
 * Affiché tant que `session === null` (cf. AppContent / Auth gate).
 */

type Mode = 'signin' | 'signup' | 'magic';

export function AuthScreen() {
    const [mode, setMode] = useState<Mode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setLoading(true);
        setError(null);
        setInfo(null);
        try {
            if (mode === 'signin') {
                const { error: err } = await supabase.auth.signInWithPassword({ email, password });
                if (err) throw err;
            } else if (mode === 'signup') {
                const { error: err } = await supabase.auth.signUp({ email, password });
                if (err) throw err;
                setInfo("Compte créé. Vérifie ta boîte mail si une confirmation est requise.");
            } else {
                const { error: err } = await supabase.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: window.location.origin },
                });
                if (err) throw err;
                setInfo('Lien de connexion envoyé. Ouvre le mail pour finaliser.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    if (!isSupabaseConfigured) {
        return (
            <div className="flex h-screen items-center justify-center p-4">
                <Surface className="max-w-md p-8 text-center">
                    <h2 className="t-h2">Supabase non configuré</h2>
                    <p className="t-body-quiet mt-2">
                        Définis <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>{' '}
                        dans <code>.env.local</code> puis relance le serveur.
                    </p>
                </Surface>
            </div>
        );
    }

    return (
        <div
            className="flex h-screen items-center justify-center p-4"
            style={{ background: 'var(--bg-page)' }}
        >
            <Surface className="w-full max-w-md p-8">
                <div className="mb-6 flex items-center gap-3">
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'var(--ink-1)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-display)',
                            fontWeight: 600,
                            fontSize: 18,
                            letterSpacing: '-0.06em',
                        }}
                    >
                        O
                    </div>
                    <div>
                        <p className="eyebrow">Organigrad</p>
                        <h1 className="t-h2" style={{ fontSize: 22 }}>
                            {mode === 'signup' ? 'Créer un compte' : 'Connexion'}
                        </h1>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Email">
                        <Input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="vous@exemple.fr"
                            autoComplete="email"
                            autoFocus
                        />
                    </FormField>

                    {mode !== 'magic' && (
                        <FormField label="Mot de passe">
                            <Input
                                type="password"
                                required
                                minLength={8}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                            />
                        </FormField>
                    )}

                    {error && (
                        <p className="text-[12px]" style={{ color: 'var(--system-red)' }}>
                            {error}
                        </p>
                    )}
                    {info && (
                        <p className="text-[12px]" style={{ color: 'var(--system-green)' }}>
                            {info}
                        </p>
                    )}

                    <Button tone="blue" type="submit" disabled={loading} className="w-full">
                        {loading
                            ? '…'
                            : mode === 'signup'
                              ? 'Créer le compte'
                              : mode === 'magic'
                                ? 'Envoyer le lien'
                                : 'Se connecter'}
                    </Button>
                </form>

                <div className="mt-6 flex flex-col items-center gap-2 text-[12px]" style={{ color: 'var(--fg-3)' }}>
                    {mode === 'signin' && (
                        <>
                            <button
                                type="button"
                                onClick={() => setMode('magic')}
                                className="hover:underline"
                                style={{ color: 'var(--accent)' }}
                            >
                                Connexion par lien magique
                            </button>
                            <span>
                                Pas de compte ?{' '}
                                <button
                                    type="button"
                                    onClick={() => setMode('signup')}
                                    style={{ color: 'var(--accent)' }}
                                    className="hover:underline"
                                >
                                    Créer un compte
                                </button>
                            </span>
                        </>
                    )}
                    {mode === 'signup' && (
                        <button
                            type="button"
                            onClick={() => setMode('signin')}
                            style={{ color: 'var(--accent)' }}
                            className="hover:underline"
                        >
                            J'ai déjà un compte
                        </button>
                    )}
                    {mode === 'magic' && (
                        <button
                            type="button"
                            onClick={() => setMode('signin')}
                            style={{ color: 'var(--accent)' }}
                            className="hover:underline"
                        >
                            Revenir au mot de passe
                        </button>
                    )}
                </div>
            </Surface>
        </div>
    );
}
