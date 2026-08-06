import { useEffect, useState } from 'react';
import { BookOpen, Check, FolderKanban, Link2, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useFeedback } from '../../feedback/FeedbackContext';
import { identityCoreStore } from '../../services/identityCoreStore';
import { publishIdentityVersion, publishProjectCreated } from '../../services/identityContextEvents';
import { PROJECT_APPLICATIONS, type BrandIdentity, type IndependentProject } from '../../types/identityCore';

const fieldClass = 'w-full rounded-xl border border-[var(--hairline)] bg-white px-3 py-2.5 text-sm text-[var(--fg-1)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(0,113,227,0.12)]';

const emptyIdentity = {
    companyName: '',
    brandName: '',
    positioning: '',
    tone: '',
    visualStyle: '',
    externalCommunication: '',
};

const emptyProject = {
    name: '',
    description: '',
    ownerApp: 'NED IA',
    identityId: '',
    participatingApps: [] as string[],
};

function IdentityCard({ identity, onPublish }: { identity: BrandIdentity; onPublish: () => void }) {
    return (
        <article className="rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fg-4)]">Identité de marque</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--fg-1)]">{identity.brandName}</h3>
                    <p className="mt-0.5 text-xs text-[var(--fg-3)]">{identity.companyName}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${identity.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {identity.status === 'published' ? `Publiée · v${identity.version}` : 'Brouillon'}
                </span>
            </div>
            <div className="mt-4 grid gap-3 text-xs text-[var(--fg-2)] sm:grid-cols-2">
                <div><span className="font-semibold text-[var(--fg-4)]">Positionnement</span><p className="mt-1 line-clamp-3">{identity.positioning || 'Non renseigné'}</p></div>
                <div><span className="font-semibold text-[var(--fg-4)]">Ton</span><p className="mt-1 line-clamp-3">{identity.tone || 'Non renseigné'}</p></div>
                <div><span className="font-semibold text-[var(--fg-4)]">Style visuel</span><p className="mt-1 line-clamp-3">{identity.visualStyle || 'Non renseigné'}</p></div>
                <div><span className="font-semibold text-[var(--fg-4)]">Communication externe</span><p className="mt-1 line-clamp-3">{identity.externalCommunication || 'Non renseigné'}</p></div>
            </div>
            {identity.status !== 'published' && (
                <button type="button" onClick={onPublish} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--ink-1)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90">
                    <ShieldCheck size={14} /> Publier cette identité
                </button>
            )}
        </article>
    );
}

function ProjectCard({ project, identity }: { project: IndependentProject; identity: BrandIdentity | undefined }) {
    return (
        <article className="rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fg-4)]">{project.ownerApp}</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--fg-1)]">{project.name}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{project.status}</span>
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-[var(--fg-2)]">{project.description || 'Aucune description'}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--fg-3)]">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1"><Link2 size={12} /> {identity ? `${identity.brandName} · v${project.identityVersion}` : 'Aucune identité liée'}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1"><FolderKanban size={12} /> {project.participatingApps.length} application{project.participatingApps.length > 1 ? 's' : ''}</span>
            </div>
            {project.participatingApps.length > 0 && <p className="mt-3 text-[11px] text-[var(--fg-4)]">{project.participatingApps.join(' · ')}</p>}
        </article>
    );
}

export const IdentityCoreView: React.FC = () => {
    const { activeId: workspaceId } = useWorkspaceContext();
    const feedback = useFeedback();
    const [state, setState] = useState(() => identityCoreStore.list(workspaceId));
    const [identityForm, setIdentityForm] = useState(emptyIdentity);
    const [projectForm, setProjectForm] = useState(emptyProject);

    useEffect(() => {
        const reload = (event: Event) => {
            const detail = (event as CustomEvent<{ workspaceId: string | null }>).detail;
            if (!detail || detail.workspaceId === workspaceId) setState(identityCoreStore.list(workspaceId));
        };
        window.addEventListener('organigrad:identity-core-changed', reload);
        return () => window.removeEventListener('organigrad:identity-core-changed', reload);
    }, [workspaceId]);

    useEffect(() => {
        setState(identityCoreStore.list(workspaceId));
    }, [workspaceId]);

    const createIdentity = (event: React.FormEvent) => {
        event.preventDefault();
        if (!identityForm.companyName.trim() || !identityForm.brandName.trim()) {
            feedback.error('Le nom de la société et celui de la marque sont obligatoires.');
            return;
        }
        identityCoreStore.createIdentity(workspaceId, identityForm);
        setIdentityForm(emptyIdentity);
        feedback.success('Identité créée en brouillon.');
    };

    const createProject = (event: React.FormEvent) => {
        event.preventDefault();
        if (!projectForm.name.trim()) {
            feedback.error('Le nom du projet est obligatoire.');
            return;
        }
        const identity = state.identities.find((item) => item.id === projectForm.identityId);
        const project = identityCoreStore.createProject(workspaceId, {
            ...projectForm,
            description: projectForm.description.trim(),
            identityId: identity?.id ?? null,
            identityVersion: identity?.version ?? null,
        });
        publishProjectCreated(project, workspaceId);
        setProjectForm(emptyProject);
        feedback.success('Projet indépendant créé.');
    };

    const toggleApp = (app: string) => setProjectForm((current) => ({
        ...current,
        participatingApps: current.participatingApps.includes(app)
            ? current.participatingApps.filter((item) => item !== app)
            : [...current.participatingApps, app],
    }));

    return (
        <div className="h-full overflow-y-auto bg-[var(--bg-page)] px-5 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                    <div>
                        <div className="flex items-center gap-2 text-[var(--accent)]"><Sparkles size={17} /><span className="text-[10px] font-semibold uppercase tracking-[0.18em]">APPS-2026 · Identity Core</span></div>
                        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--fg-1)]">Identités et projets</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--fg-3)]">Identity Core conserve l’identité de référence. Chaque application crée ses propres projets et ne reçoit qu’un lien versionné vers la marque.</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--hairline)] bg-white px-4 py-3 text-xs text-[var(--fg-3)]"><span className="font-semibold text-[var(--fg-1)]">Cloisonnement actif</span><br />Données isolées par workspace</div>
                </div>

                <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <form onSubmit={createIdentity} className="rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-2"><BookOpen size={17} className="text-[var(--accent)]" /><h2 className="font-semibold text-[var(--fg-1)]">Créer une identité</h2></div>
                        <p className="mt-1 text-xs text-[var(--fg-3)]">La première version est créée en brouillon, puis publiée après validation.</p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <input className={fieldClass} placeholder="Nom de la société *" value={identityForm.companyName} onChange={(e) => setIdentityForm({ ...identityForm, companyName: e.target.value })} />
                            <input className={fieldClass} placeholder="Nom de la marque *" value={identityForm.brandName} onChange={(e) => setIdentityForm({ ...identityForm, brandName: e.target.value })} />
                            <textarea className={`${fieldClass} sm:col-span-2`} rows={2} placeholder="Positionnement" value={identityForm.positioning} onChange={(e) => setIdentityForm({ ...identityForm, positioning: e.target.value })} />
                            <textarea className={fieldClass} rows={2} placeholder="Ton rédactionnel" value={identityForm.tone} onChange={(e) => setIdentityForm({ ...identityForm, tone: e.target.value })} />
                            <textarea className={fieldClass} rows={2} placeholder="Style visuel" value={identityForm.visualStyle} onChange={(e) => setIdentityForm({ ...identityForm, visualStyle: e.target.value })} />
                            <textarea className={`${fieldClass} sm:col-span-2`} rows={2} placeholder="Règles de communication externe et réseaux sociaux" value={identityForm.externalCommunication} onChange={(e) => setIdentityForm({ ...identityForm, externalCommunication: e.target.value })} />
                        </div>
                        <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--ink-1)] px-4 py-2.5 text-xs font-semibold text-white transition hover:opacity-90"><Plus size={15} /> Créer l’identité</button>
                    </form>

                    <form onSubmit={createProject} className="rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-2"><FolderKanban size={17} className="text-[var(--accent)]" /><h2 className="font-semibold text-[var(--fg-1)]">Créer un projet indépendant</h2></div>
                        <p className="mt-1 text-xs text-[var(--fg-3)]">Le projet reste la propriété de l’application sélectionnée.</p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <input className={fieldClass} placeholder="Nom du projet *" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
                            <select className={fieldClass} value={projectForm.ownerApp} onChange={(e) => setProjectForm({ ...projectForm, ownerApp: e.target.value })}>{PROJECT_APPLICATIONS.map((app) => <option key={app}>{app}</option>)}</select>
                            <select className={`${fieldClass} sm:col-span-2`} value={projectForm.identityId} onChange={(e) => setProjectForm({ ...projectForm, identityId: e.target.value })}><option value="">Sans identité pour le moment</option>{state.identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.brandName} · v{identity.version} · {identity.status}</option>)}</select>
                            <textarea className={`${fieldClass} sm:col-span-2`} rows={2} placeholder="Description du projet" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} />
                        </div>
                        <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-4)]">Applications participantes</p><div className="mt-2 flex flex-wrap gap-2">{PROJECT_APPLICATIONS.map((app) => <button type="button" key={app} onClick={() => toggleApp(app)} className={`rounded-full border px-2.5 py-1.5 text-[11px] transition ${projectForm.participatingApps.includes(app) ? 'border-[var(--accent)] bg-blue-50 text-[var(--accent)]' : 'border-[var(--hairline)] bg-white text-[var(--fg-3)] hover:border-[var(--hairline-strong)]'}`}>{projectForm.participatingApps.includes(app) && <Check size={12} className="mr-1 inline" />}{app}</button>)}</div></div>
                        <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--ink-1)] px-4 py-2.5 text-xs font-semibold text-white transition hover:opacity-90"><Plus size={15} /> Créer le projet</button>
                    </form>
                </div>

                <section className="mt-10"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold tracking-tight text-[var(--fg-1)]">Identités de référence</h2><p className="mt-1 text-xs text-[var(--fg-3)]">Une identité publiée peut être utilisée par plusieurs projets sans duplication.</p></div><span className="text-xs text-[var(--fg-4)]">{state.identities.length} identité{state.identities.length > 1 ? 's' : ''}</span></div><div className="mt-4 grid gap-4 lg:grid-cols-2">{state.identities.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--hairline-strong)] p-8 text-center text-sm text-[var(--fg-3)]">Aucune identité créée dans ce workspace.</div> : state.identities.map((identity) => <IdentityCard key={identity.id} identity={identity} onPublish={() => { const published = identityCoreStore.publishIdentity(workspaceId, identity.id); if (published) publishIdentityVersion(published, workspaceId); feedback.success('Identité publiée et versionnée.'); }} />)}</div></section>

                <section className="mt-10 pb-10"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold tracking-tight text-[var(--fg-1)]">Projets indépendants</h2><p className="mt-1 text-xs text-[var(--fg-3)]">Chaque projet possède son propre périmètre et pointe vers une identité précise.</p></div><span className="text-xs text-[var(--fg-4)]">{state.projects.length} projet{state.projects.length > 1 ? 's' : ''}</span></div><div className="mt-4 grid gap-4 lg:grid-cols-2">{state.projects.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--hairline-strong)] p-8 text-center text-sm text-[var(--fg-3)]">Aucun projet créé dans ce workspace.</div> : state.projects.map((project) => <ProjectCard key={project.id} project={project} identity={state.identities.find((identity) => identity.id === project.identityId)} />)}</div></section>
            </div>
        </div>
    );
};
