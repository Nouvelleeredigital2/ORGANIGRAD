import { useEffect, useRef, useState } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useSession } from '../../hooks/useSession';
import { useAppRoute } from '../../routing/useAppRoute';
import { isProjectsEnabled, isPrivateProjectsEnabled } from '../../lib/projectsFeature';
import { PrivateProjectAccess } from '../projects/PrivateProjectAccess';
import { createProjectRepo, isProjectUuid, type ProjectRepo } from '../../services/projectRepo';
import type { Project, ProjectTask, ProjectMember, ProjectTaskStatus, NewProject, NewTask } from '../../types/project';
import type { WorkspaceRole } from '../../types/supabase';
import { BaseModal } from '../BaseModal';
import { Button, FormField, Input, Pill, Select, Surface, Textarea } from '../../design/ui';

const statusLabels: Record<ProjectTaskStatus, string> = { todo: 'À faire', running: 'En cours', blocked: 'Bloquée', done: 'Terminée' };
const describe = (error: unknown) => error instanceof Error ? error.message : 'Le service Projets est indisponible. Réessayez.';

export function ProjectsView() {
    const ws = useWorkspaceContext();
    const { session, loading } = useSession();
    const { route, navigate } = useAppRoute();
    const [revision, setRevision] = useState(0);
    const [sessionGeneration, setSessionGeneration] = useState({ token: session?.access_token, generation: 0 });
    if (sessionGeneration.token !== session?.access_token) {
        setSessionGeneration({ token: session?.access_token, generation: sessionGeneration.generation + 1 });
    }
    if (!isProjectsEnabled()) return <p className="p-6">Les projets ne sont pas activés.</p>;
    if ((loading || ws.loading) && (!session || !ws.activeWorkspace)) return <p role="status" className="p-6">Chargement de l’espace…</p>;
    if (!session) return <p className="p-6">Connectez-vous pour consulter les projets.</p>;
    if (ws.error && !ws.activeWorkspace) return <p role="alert" className="p-6">{ws.error}</p>;
    if (session.user.id !== ws.userId || !ws.activeWorkspace || !ws.workspaces.some(w => w.id === ws.activeId)) return <p role="alert" className="p-6">Sélectionnez un espace accessible pour consulter ses projets.</p>;
    if ((route.projectId && !isProjectUuid(route.projectId)) || (route.workspaceId && !isProjectUuid(route.workspaceId))) return <p role="alert" className="p-6">Lien de projet invalide.</p>;
    if (route.workspaceId && route.workspaceId !== ws.activeId) {
        const linked = ws.workspaces.find(w => w.id === route.workspaceId);
        return <div className="p-6 space-y-4">
            {linked ? <><p>Ce projet appartient à l’espace {linked.name}.</p><Button onClick={() => ws.setActive(linked.id)}>Ouvrir l’espace {linked.name}</Button></> : <p role="alert">Cet espace est inaccessible.</p>}
            <Button variant="outline" onClick={() => navigate({ projectId: null, workspaceId: null })}>Voir les projets de l’espace actuel</Button>
        </div>;
    }
    // Changing any security boundary unmounts forms, locks and pending operations.
    const key = JSON.stringify([session.user.id, sessionGeneration.generation, ws.activeWorkspace.id, ws.activeWorkspace.role, route.projectId, revision]);
    return <ProjectsWorkspace key={key} userId={session.user.id} accessToken={session.access_token}
        workspaceId={ws.activeWorkspace.id} workspaceName={ws.activeWorkspace.name} role={ws.activeWorkspace.role}
        accessChecking={loading || ws.loading} accessError={ws.error} onRecheck={() => { void ws.refresh(); }}
        projectId={route.projectId ?? null} onSelect={id => navigate({ view: 'projects', projectId: id, workspaceId: id ? ws.activeWorkspace!.id : null })}
        onReload={() => setRevision(n => n + 1)} />;
}

interface WorkspaceProps {
    userId: string; accessToken: string; workspaceId: string; workspaceName: string; role: WorkspaceRole;
    accessChecking: boolean; accessError: string | null; onRecheck: () => void;
    projectId: string | null; onSelect: (id: string | null) => void; onReload: () => void;
}
interface Loaded {
    repo: ProjectRepo; isCurrent: () => boolean; role: WorkspaceRole;
    projects: Project[]; members: ProjectMember[]; project: Project | null; tasks: ProjectTask[];
}
type Editor = { kind: 'project'; id: string; original?: Project } | { kind: 'task'; id: string; original?: ProjectTask };
type Archive = { kind: 'project'; row: Project } | { kind: 'task'; row: ProjectTask };

function ProjectsWorkspace({ userId, accessToken, workspaceId, workspaceName, role, projectId, onSelect, onReload, accessChecking, accessError, onRecheck }: WorkspaceProps) {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [archive, setArchive] = useState<Archive | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const [busy, setBusy] = useState(false);
    const [synapseOpen, setSynapseOpen] = useState(false);
    const lock = useRef(false);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const isCurrent = () => active;
        const repo = createProjectRepo({ userId, accessToken, workspaceId, isCurrent, signal: controller.signal });
        void (async () => {
            try {
                // Validate current membership before reading a project supplied by URL.
                const currentRole = await repo.getRole();
                if (!active) return;
                const [projects, members, project] = await Promise.all([
                    repo.listProjects(), repo.listMembers(), projectId ? repo.getProject(projectId) : Promise.resolve(null),
                ]);
                if (!active) return;
                const tasks = project ? await repo.listTasks(project.id) : [];
                if (active) setLoaded({ repo, isCurrent, role: currentRole, projects, members, project, tasks });
            } catch (err) {
                if (active) setLoadError(describe(err));
            }
        })();
        return () => { active = false; controller.abort(); };
    }, [userId, accessToken, workspaceId, projectId]);

    if (loadError) return <div className="p-6 space-y-4"><p role="alert">{loadError}</p><Button onClick={onReload}>Réessayer</Button><Button variant="outline" onClick={() => onSelect(null)}>Tous les projets</Button></div>;
    if (!loaded) return <p role="status" className="p-6">Chargement des projets…</p>;
    // Background membership refresh must gate writes without remounting a
    // same-boundary editor (its UUID also identifies an uncertain creation).
    const accessBlocked = accessChecking || !!accessError;
    const canWrite = !accessBlocked && ['owner', 'admin', 'member'].includes(loaded.role) && ['owner', 'admin', 'member'].includes(role);
    const project = loaded.project;
    const canWriteTasks = canWrite && project !== null && project.archived_at === null;

    const perform = async (operation: () => Promise<void>) => {
        if (lock.current || !canWrite || !loaded.isCurrent()) return;
        lock.current = true;
        setBusy(true); setError(null); setNotice(null);
        try { await operation(); }
        catch (err) { if (loaded.isCurrent()) setError(describe(err)); }
        finally {
            if (loaded.isCurrent()) { lock.current = false; setBusy(false); }
        }
    };
    const replaceProject = (row: Project) => setLoaded(previous => previous && ({ ...previous, project: previous.project?.id === row.id ? row : previous.project, projects: previous.projects.map(p => p.id === row.id ? row : p) }));
    const replaceTask = (row: ProjectTask) => setLoaded(previous => previous && ({ ...previous, tasks: previous.tasks.some(t => t.id === row.id) ? previous.tasks.map(t => t.id === row.id ? row : t) : [...previous.tasks, row] }));
    const saved = () => { setEditor(null); setArchive(null); setNotice('Modifications enregistrées.'); };
    const saveProject = (input: NewProject) => perform(async () => {
        const original = editor?.kind === 'project' ? editor.original : undefined;
        const row = original ? await loaded.repo.updateProject(original.id, original.version, { name: input.name, description: input.description }) : await loaded.repo.createProject(input);
        if (!loaded.isCurrent()) return;
        replaceProject(row); saved();
        if (!original) onSelect(row.id);
    });
    const saveTask = (input: NewTask) => perform(async () => {
        if (!canWriteTasks || !project) return;
        const original = editor?.kind === 'task' ? editor.original : undefined;
        const { id, ...changes } = input;
        const row = original ? await loaded.repo.updateTask(project.id, id, original.version, changes) : await loaded.repo.createTask(project.id, input);
        if (!loaded.isCurrent()) return;
        replaceTask(row); saved();
    });
    const confirmArchive = () => perform(async () => {
        if (!archive) return;
        const changes = { archived_at: archive.row.archived_at ? null : new Date().toISOString() };
        if (archive.kind === 'project') {
            const row = await loaded.repo.updateProject(archive.row.id, archive.row.version, changes);
            if (!loaded.isCurrent()) return;
            replaceProject(row);
        } else {
            if (!canWriteTasks || !project) return;
            const row = await loaded.repo.updateTask(project.id, archive.row.id, archive.row.version, changes);
            if (!loaded.isCurrent()) return;
            replaceTask(row);
        }
        saved();
    });
    const openEditor = (next: Editor) => { if (!lock.current) { setError(null); setEditor(next); } };
    const openArchive = (next: Archive) => { if (!lock.current) { setError(null); setArchive(next); } };
    const projects = loaded.projects.filter(p => showArchived || !p.archived_at);
    const tasks = loaded.tasks.filter(t => showArchived || !t.archived_at);
    const accessNotice = accessChecking
        ? <p role="status" className="mb-4 text-sm">Vérification de l’accès à l’espace… Vos modifications sont conservées.</p>
        : accessError ? <div className="mb-4 space-y-2"><p role="alert" className="text-sm text-[var(--system-red)]">{accessError} Les écritures sont suspendues ; vos modifications sont conservées.</p><Button variant="outline" onClick={onRecheck}>Revérifier l’accès</Button></div> : null;

    return <section aria-label="Projets" className="h-full overflow-y-auto p-4 sm:p-6 lg:p-10 text-[var(--fg-1)]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2"><FolderKanban size={22} aria-hidden="true" /><h1 className="text-2xl font-semibold tracking-tight">Projets</h1></div><p className="mt-1 text-sm text-[var(--fg-3)]">{workspaceName}</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={onReload}>Actualiser</Button>{canWrite && <Button disabled={busy} onClick={() => openEditor({ kind: 'project', id: crypto.randomUUID() })}><Plus size={16} aria-hidden="true" />Nouveau projet</Button>}</div>
        </header>
        {!editor && !archive && accessNotice}
        {!canWrite && !accessBlocked && <p className="mb-4 text-sm">Lecture seule — vous pouvez consulter les projets et leurs tâches.</p>}
        {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
        {error && !editor && !archive && <p role="alert" className="mb-4 text-sm text-[var(--system-red)]">{error}</p>}
        <label className="mb-5 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Afficher les éléments archivés</label>
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
            <div className="min-w-0"><h2 className="mb-3 text-sm font-semibold">Tous les projets</h2>
                {!projects.length ? <p className="text-sm text-[var(--fg-3)]">{loaded.projects.length ? 'Aucun projet actif. Affichez les éléments archivés.' : 'Aucun projet pour le moment.'}</p> : <ul className="space-y-2">{projects.map(p => <li key={p.id}><button type="button" disabled={busy} onClick={() => onSelect(p.id)} aria-current={project?.id === p.id ? 'page' : undefined} className="w-full min-h-11 rounded-xl border border-[var(--hairline)] p-3 text-left hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"><span className="block break-words font-medium">{p.name}</span>{p.archived_at && <Pill>Archivé</Pill>}</button></li>)}</ul>}
            </div>
            {project ? <div className="min-w-0 space-y-5">
                <Surface className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 break-words text-xl font-semibold">{project.name}</h2>{project.archived_at && <Pill>Projet archivé</Pill>}</div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[var(--fg-3)]">{project.description || 'Aucune description.'}</p>
                    {canWrite && <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => openEditor({ kind: 'project', id: project.id, original: project })}>Modifier le projet</Button><Button variant="outline" disabled={busy} onClick={() => openArchive({ kind: 'project', row: project })}>{project.archived_at ? 'Restaurer le projet' : 'Archiver le projet'}</Button></div>}
                </Surface>
                {isPrivateProjectsEnabled() && <div>
                    <Button variant="outline" disabled={accessBlocked || busy || !!editor || !!archive} onClick={() => setSynapseOpen(true)}>Accès Synapse</Button>
                    {synapseOpen && <PrivateProjectAccess ownerId={userId} accessToken={accessToken} workspaceId={workspaceId} projectId={project.id} projectName={project.name}
                        accessChecking={accessChecking} accessError={accessError} onRecheck={onRecheck} onClose={() => setSynapseOpen(false)} />}
                </div>}
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Tâches</h3>{canWriteTasks && <Button disabled={busy} onClick={() => openEditor({ kind: 'task', id: crypto.randomUUID() })}><Plus size={16} aria-hidden="true" />Nouvelle tâche</Button>}</div>
                {project.archived_at && <p className="text-sm text-[var(--fg-3)]">Restaurez le projet pour modifier ses tâches.</p>}
                {!tasks.length ? <p className="text-sm text-[var(--fg-3)]">{loaded.tasks.length ? 'Aucune tâche active. Affichez les éléments archivés.' : 'Aucune tâche pour le moment.'}</p> : <ul className="space-y-3">{tasks.map(task => <li key={task.id}><Surface className="p-4"><div className="flex flex-wrap items-start gap-2"><h4 className="min-w-0 flex-1 break-words font-medium">{task.title}</h4><Pill>{statusLabels[task.status]}</Pill>{task.archived_at && <Pill>Archivée</Pill>}</div>
                    {task.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--fg-3)]">{task.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--fg-3)]"><span>{task.assignee_id ? loaded.members.find(m => m.id === task.assignee_id)?.label ?? 'Ancien membre (non assignable)' : 'Non attribuée'}</span><span>{task.due_date ? <>Échéance : <time dateTime={task.due_date}>{task.due_date.split('-').reverse().join('/')}</time></> : 'Sans échéance'}</span></div>
                    {canWriteTasks && <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} aria-label={`Modifier la tâche ${task.title}`} onClick={() => openEditor({ kind: 'task', id: task.id, original: task })}>Modifier</Button><Button variant="ghost" disabled={busy} aria-label={`${task.archived_at ? 'Restaurer' : 'Archiver'} la tâche ${task.title}`} onClick={() => openArchive({ kind: 'task', row: task })}>{task.archived_at ? 'Restaurer' : 'Archiver'}</Button></div>}
                </Surface></li>)}</ul>}
            </div> : <Surface className="p-6 text-sm text-[var(--fg-3)]">Sélectionnez un projet pour consulter ses tâches.</Surface>}
        </div>
        {editor && <BaseModal isOpen onClose={() => { if (!lock.current) { setEditor(null); setError(null); } }} title={editor.kind === 'project' ? (editor.original ? 'Modifier le projet' : 'Nouveau projet') : (editor.original ? 'Modifier la tâche' : 'Nouvelle tâche')}>
            {accessNotice}
            {editor.kind === 'project' ? <ProjectForm key={editor.id} editor={editor} busy={busy} blocked={accessBlocked} error={error} onSave={saveProject} /> : <TaskForm key={editor.id} editor={editor} members={loaded.members} busy={busy} blocked={accessBlocked} error={error} onSave={saveTask} />}
        </BaseModal>}
        {archive && <BaseModal isOpen onClose={() => { if (!lock.current) { setArchive(null); setError(null); } }} title={archive.row.archived_at ? 'Confirmer la restauration' : 'Confirmer l’archivage'}>
            {accessNotice}
            <p className="mb-4 break-words">{archive.row.archived_at ? 'Restaurer' : 'Archiver'} « {archive.kind === 'project' ? archive.row.name : archive.row.title} » ?{archive.kind === 'project' && !archive.row.archived_at && ' Ses tâches resteront consultables en lecture seule.'}</p>
            {error && <p role="alert" className="mb-4 text-sm text-[var(--system-red)]">{error}</p>}
            <div className="flex flex-wrap gap-2"><Button disabled={busy || accessBlocked} onClick={() => void confirmArchive()}>{busy ? 'Enregistrement…' : 'Confirmer'}</Button><Button variant="outline" disabled={busy} onClick={() => { setArchive(null); setError(null); }}>Annuler</Button></div>
        </BaseModal>}
    </section>;
}

function ProjectForm({ editor, busy, blocked, error, onSave }: { editor: Extract<Editor, { kind: 'project' }>; busy: boolean; blocked: boolean; error: string | null; onSave: (input: NewProject) => Promise<void> }) {
    const [name, setName] = useState(editor.original?.name ?? '');
    const [description, setDescription] = useState(editor.original?.description ?? '');
    return <form onSubmit={e => { e.preventDefault(); void onSave({ id: editor.id, name, description }); }} aria-busy={busy}>
        <fieldset disabled={busy || blocked} className="space-y-4">
            <FormField label="Nom"><Input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></FormField>
            <FormField label="Description"><Textarea maxLength={500} value={description} onChange={e => setDescription(e.target.value)} /></FormField>
            {error && <p role="alert" className="text-sm text-[var(--system-red)]">{error}</p>}
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Enregistrement…' : editor.original ? 'Enregistrer le projet' : 'Créer le projet'}</Button>
        </fieldset>
    </form>;
}

function TaskForm({ editor, members, busy, blocked, error, onSave }: { editor: Extract<Editor, { kind: 'task' }>; members: ProjectMember[]; busy: boolean; blocked: boolean; error: string | null; onSave: (input: NewTask) => Promise<void> }) {
    const [title, setTitle] = useState(editor.original?.title ?? '');
    const [description, setDescription] = useState(editor.original?.description ?? '');
    const [status, setStatus] = useState<ProjectTaskStatus>(editor.original?.status ?? 'todo');
    const [assignee, setAssignee] = useState(editor.original?.assignee_id ?? '');
    const [dueDate, setDueDate] = useState(editor.original?.due_date ?? '');
    const formerMember = !!assignee && !members.some(m => m.id === assignee);
    return <form onSubmit={e => {
        e.preventDefault();
        // A former assignee can be kept on edit, but cannot be newly selected.
        const assignment = formerMember ? {} : { assignee_id: assignee || null };
        void onSave({ id: editor.id, title, description, status, ...assignment, due_date: dueDate || null });
    }} aria-busy={busy}>
        <fieldset disabled={busy || blocked} className="space-y-4">
            <FormField label="Titre"><Input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></FormField>
            <FormField label="Description"><Textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></FormField>
            <FormField label="Statut"><Select value={status} onChange={e => setStatus(e.target.value as ProjectTaskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
            <FormField label="Responsable"><Select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Non attribuée</option>{formerMember && <option value={assignee} disabled>Ancien membre (non assignable)</option>}{members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></FormField>
            <FormField label="Échéance"><Input type="date" min="0001-01-01" max="9999-12-31" value={dueDate} onChange={e => setDueDate(e.target.value)} /></FormField>
            {error && <p role="alert" className="text-sm text-[var(--system-red)]">{error}</p>}
            <Button type="submit" disabled={busy || !title.trim()}>{busy ? 'Enregistrement…' : editor.original ? 'Enregistrer la tâche' : 'Créer la tâche'}</Button>
        </fieldset>
    </form>;
}
