import { useMemo, useState } from 'react';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useSession } from '../../hooks/useSession';

const CODE = /^[A-Za-z0-9_-]{43}$/;

interface Props {
    fetcher?: typeof fetch;
    navigate?: (url: string) => void;
}

export function SynapseLaunchView({ fetcher = fetch, navigate = url => window.location.assign(url) }: Props) {
    const { session } = useSession();
    const workspace = useWorkspaceContext();
    const code = useMemo(() => new URLSearchParams(window.location.search).get('code') ?? '', []);
    const [selected, setSelected] = useState(workspace.workspaces.length === 1 ? workspace.workspaces[0]!.id : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(CODE.test(code) ? null : 'Le code de lancement Synapse est invalide ou absent.');

    const submit = async () => {
        if (!session?.access_token || !selected || !CODE.test(code)) return;
        setBusy(true); setError(null);
        try {
            const base = String(import.meta.env.VITE_ORCHESTRATOR_URL ?? '').replace(/\/$/, '');
            const response = await fetcher(`${base}/api/synapse/suite/launch`, {
                method: 'POST', cache: 'no-store',
                headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', 'x-workspace-id': selected },
                body: JSON.stringify({ code }),
            });
            const payload = await response.json() as { redirect?: unknown; error?: unknown };
            if (!response.ok || typeof payload.redirect !== 'string' || !payload.redirect.startsWith('/?')) throw new Error(typeof payload.error === 'string' ? payload.error : 'OPEN_FAILED');
            workspace.setActive(selected);
            navigate(payload.redirect);
        } catch {
            setError('Impossible d’ouvrir ce projet. Le lien est peut-être expiré ou déjà utilisé.');
        } finally { setBusy(false); }
    };

    return (
        <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
            <section className="mx-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl" aria-labelledby="synapse-launch-title">
                <h1 id="synapse-launch-title" className="text-2xl font-semibold">Ouvrir le projet Synapse</h1>
                <p className="mt-2 text-sm text-slate-300">Choisissez l’espace OrganiGrad qui accueillera ce projet.</p>
                {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/50 bg-red-950 p-3 text-sm text-red-100">{error}</p>}
                {!error && workspace.error && <p role="alert" className="mt-4 text-sm text-red-200">{workspace.error}</p>}
                <div className="mt-6 grid gap-3" role="group" aria-label="Espaces OrganiGrad">
                    {workspace.workspaces.map(item => (
                        <button key={item.id} type="button" aria-pressed={selected === item.id}
                            onClick={() => setSelected(item.id)}
                            className={`min-h-12 rounded-xl border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-cyan-400 ${selected === item.id ? 'border-cyan-400 bg-cyan-950' : 'border-slate-600 bg-slate-800'}`}>
                            <span className="block font-medium">{item.name}</span>
                            <span className="text-xs text-slate-400">Rôle : {item.role}</span>
                        </button>
                    ))}
                </div>
                {!workspace.loading && workspace.workspaces.length === 0 && <p role="alert" className="mt-4 text-sm">Aucun espace OrganiGrad accessible.</p>}
                <button type="button" disabled={busy || !selected || Boolean(error)} onClick={() => void submit()}
                    className="mt-6 min-h-12 w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? 'Ouverture…' : 'Continuer'}
                </button>
            </section>
        </main>
    );
}
