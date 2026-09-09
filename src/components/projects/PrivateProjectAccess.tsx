import { useEffect, useRef, useState } from 'react';
import { BaseModal } from '../BaseModal';
import { Button, FormField, Input, Select } from '../../design/ui';
import { createPrivateProjectTokens, PRIVATE_PROJECT_ERROR, type PrivateTokenPage, type PrivateTokenMetadata } from '../../services/privateProjectTokens';

interface Props {
    ownerId: string; accessToken: string; workspaceId: string; projectId: string; projectName: string;
    accessChecking: boolean; accessError: string | null; onRecheck: () => void; onClose: () => void;
}
type Api = ReturnType<typeof createPrivateProjectTokens>;
type Runtime = { api: Api; epoch: number; controller: AbortController };
const date = (seconds: number) => new Date(seconds * 1000);

/** Parent is keyed by account/JWT generation/workspace/project/role, and unmounts on close. */
export function PrivateProjectAccess({ ownerId, accessToken, workspaceId, projectId, projectName, accessChecking, accessError, onRecheck, onClose }: Props) {
    const [page, setPage] = useState<PrivateTokenPage | null>(null);
    const [listError, setListError] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [name, setName] = useState('');
    const [duration, setDuration] = useState(3600);
    const [attempted, setAttempted] = useState(false);
    const [issued, setIssued] = useState<{ id: string; expiresAt: number } | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [confirm, setConfirm] = useState<PrivateTokenMetadata | null>(null);
    const secret = useRef<string | null>(null);
    const epoch = useRef(0);
    const runtime = useRef<Runtime | null>(null);
    const lock = useRef(false);
    const createLock = useRef(false);
    // A focus refresh keeps the same identity and in-memory secret. Only new
    // actions are suspended; the parent key still clears actual identity changes.
    const accessBlocked = accessChecking || !!accessError;
    const disabled = busy || accessBlocked;

    useEffect(() => {
        const generation = ++epoch.current;
        const controller = new AbortController();
        const isCurrent = () => epoch.current === generation && !controller.signal.aborted;
        const api = createPrivateProjectTokens({ accessToken, workspaceId, projectId, isCurrent, signal: controller.signal });
        runtime.current = { api, epoch: generation, controller };
        lock.current = true;
        void api.list().then(result => { if (isCurrent()) setPage(result); })
            .catch(() => { if (isCurrent()) setListError(true); })
            .finally(() => { if (isCurrent()) { lock.current = false; setBusy(false); } });
        return () => {
            controller.abort(); runtime.current = null; secret.current = null;
        };
    }, [accessToken, workspaceId, projectId]);

    const close = () => {
        ++epoch.current; runtime.current?.controller.abort(); runtime.current = null; secret.current = null;
        onClose();
    };
    const run = async (operation: (api: Api, current: () => boolean) => Promise<void>) => {
        const active = runtime.current;
        if (!active || lock.current || accessBlocked) return;
        const current = () => epoch.current === active.epoch && !active.controller.signal.aborted;
        lock.current = true; setBusy(true); setError(null); setNotice(null);
        try { await operation(active.api, current); }
        catch { if (current()) setError(PRIVATE_PROJECT_ERROR); }
        finally { if (current()) { lock.current = false; setBusy(false); } }
    };
    const list = (cursor?: string) => run(async (api, current) => {
        setListError(false);
        try {
            const next = await api.list(cursor);
            if (current()) setPage(previous => ({ ...next, tokens: cursor && previous
                ? [...previous.tokens, ...next.tokens.filter(row => !previous.tokens.some(old => old.id === row.id))] : next.tokens }));
        } catch { if (current()) setListError(true); }
    });
    const create = () => {
        if (lock.current || accessBlocked || createLock.current || !runtime.current || !name.trim() || !page) return;
        createLock.current = true; setAttempted(true);
        void run(async (api, current) => {
            try {
                const result = await api.create(name, Math.floor(Date.now() / 1000) + duration);
                if (!current()) return;
                secret.current = result.token;
                setIssued({ id: result.id, expiresAt: result.expiresAt }); setRevealed(false);
                // Reread real metadata: do not invent a createdAt or list row from the POST.
                try { const next = await api.list(); if (current()) { setPage(next); setListError(false); } }
                catch { if (current()) setListError(true); }
            } catch {
                if (current()) setError('Création non confirmée. Consultez la liste avant de fermer et de demander un nouvel accès ; un accès a peut-être été créé.');
            }
        });
    };
    const revoke = () => {
        if (!confirm) return;
        const id = confirm.id;
        void run(async (api, current) => {
            await api.revoke(id);
            if (!current()) return;
            if (issued?.id === id) { secret.current = null; setIssued(null); setRevealed(false); }
            setConfirm(null); setNotice('Accès révoqué.');
            try { const next = await api.list(); if (current()) { setPage(next); setListError(false); } }
            catch { if (current()) { setPage(null); setListError(true); } }
        });
    };

    return <BaseModal isOpen onClose={close} title="Accès Synapse">
        <div className="space-y-5 text-[var(--fg-1)]">
            <p className="break-words text-sm">Accès personnel à « {projectName} », en lecture seule pour ce projet (projects:read).</p>
            <p className="text-sm text-[var(--fg-3)]">La durée effective est limitée par votre session actuelle et peut être plus courte que la durée demandée. Une déconnexion ou un retrait d’accès peut invalider ce jeton.</p>
            {accessChecking ? <p role="status">Vérification de l’accès à l’espace… Le panneau et le secret sont conservés ; les actions sont suspendues.</p>
                : accessError ? <div className="space-y-2"><p role="alert">Vérification de l’accès impossible. Le panneau et le secret sont conservés ; les actions sont suspendues.</p><Button variant="outline" onClick={onRecheck}>Revérifier l’accès</Button></div> : null}
            <form className="space-y-3" autoComplete="off" onSubmit={event => { event.preventDefault(); create(); }}>
                <FormField label="Nom de l’accès"><Input value={name} maxLength={80} required disabled={disabled || attempted} onChange={event => setName(event.target.value)} /></FormField>
                <FormField label="Durée demandée"><Select value={duration} disabled={disabled || attempted} onChange={event => setDuration(Number(event.target.value))}>
                    <option value={900}>15 minutes</option><option value={3600}>1 heure</option><option value={86400}>24 heures</option><option value={604800}>7 jours</option>
                </Select></FormField>
                <Button type="submit" disabled={disabled || attempted || !name.trim() || !page}>Créer l’accès</Button>
            </form>
            {issued && <section aria-label="Accès créé" className="space-y-3 rounded-xl border border-[var(--hairline)] p-4 print:hidden">
                <p>Ce secret n’est disponible qu’ici, jusqu’à la fermeture. Enregistrez-le dans Mes connexions de Synapse.</p>
                <dl className="space-y-1 text-sm">
                    <dt>Propriétaire (UUID)</dt><dd className="select-all break-all"><code>{ownerId}</code></dd>
                    <dt>Espace (UUID)</dt><dd className="select-all break-all"><code>{workspaceId}</code></dd>
                    <dt>Projet (UUID)</dt><dd className="select-all break-all"><code>{projectId}</code></dd>
                </dl>
                <p>Expiration effective : <time dateTime={date(issued.expiresAt).toISOString()}>{date(issued.expiresAt).toLocaleString('fr-FR')}</time> (environ {Math.max(0, Math.ceil((issued.expiresAt * 1000 - Date.now()) / 60000))} min restantes).</p>
                {revealed && !accessBlocked ? <code className="block select-all break-all">{secret.current}</code> : <p>Secret masqué</p>}
                <Button variant="outline" disabled={accessBlocked} onClick={() => setRevealed(value => !value)}>{revealed ? 'Masquer le secret' : 'Révéler le secret'}</Button>
            </section>}
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            <section aria-label="Mes accès personnels" className="space-y-3">
                <h3 className="font-semibold">Mes accès personnels</h3>
                {busy && <p role="status">{!page ? 'Chargement des accès…' : 'Opération en cours…'}</p>}
                {listError && <p role="alert">{PRIVATE_PROJECT_ERROR}</p>}
                {!busy && !listError && page?.tokens.length === 0 && <p>Aucun accès personnel pour ce projet.</p>}
                {page && <ul className="space-y-3">{page.tokens.map(row => <li key={row.id} className="space-y-1 rounded-xl border border-[var(--hairline)] p-3">
                    <p className="break-words font-medium">{row.name}</p><p className="text-sm">Préfixe : <code>{row.prefix}</code></p>
                    <p className="text-sm">Créé le {new Date(row.createdAt).toLocaleString('fr-FR')} · Expire le {date(row.expiresAt).toLocaleString('fr-FR')}</p>
                    {row.revokedAt ? <p>Révoqué</p> : <><p>{row.expiresAt * 1000 <= Date.now() ? 'Expiré' : 'Non révoqué — validité liée à la session'}</p><Button variant="outline" disabled={disabled} onClick={() => setConfirm(row)} aria-label={`Révoquer ${row.name}`}>Révoquer</Button></>}
                </li>)}</ul>}
                <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled} onClick={() => { void list(); }}>{listError ? 'Réessayer la liste' : 'Actualiser les accès'}</Button>
                    {page?.nextCursor && <Button variant="outline" disabled={disabled} onClick={() => { void list(page.nextCursor); }}>Afficher la suite</Button>}</div>
            </section>
            {confirm && <section aria-label="Confirmation de révocation" className="space-y-3 rounded-xl border border-[var(--hairline)] p-4">
                <p>Révoquer « {confirm.name} » ? Synapse perdra l’accès fourni par ce jeton.</p>
                <div className="flex flex-wrap gap-2"><Button disabled={disabled} onClick={revoke}>Confirmer la révocation</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Annuler la révocation</Button></div>
            </section>}
        </div>
    </BaseModal>;
}
