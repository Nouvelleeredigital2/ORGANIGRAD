import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import type { NewProject, NewTask, ProjectChanges, TaskChanges, ProjectMember } from '../types/project';

export interface ProjectScope {
    workspaceId: string;
    userId: string;
    accessToken: string;
    isCurrent: () => boolean;
    signal?: AbortSignal;
}

export const isProjectUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const expired = () => new Error('La session ou l’espace a changé. Rechargez les projets.');

function textField(value: string, max: number, label: string, required = false): string {
    const result = required ? value.trim() : value;
    if ((required && !result) || result.length > max) throw new Error(`${label} : ${required ? '1' : '0'} à ${max} caractères.`);
    return result;
}

function projectChanges(input: ProjectChanges): ProjectChanges {
    const output: ProjectChanges = {};
    if (input.name !== undefined) output.name = textField(input.name, 160, 'Nom', true);
    if (input.description !== undefined) output.description = textField(input.description, 500, 'Description');
    if (input.archived_at !== undefined) output.archived_at = input.archived_at;
    return output;
}

function taskChanges(input: TaskChanges): TaskChanges {
    const output: TaskChanges = {};
    if (input.title !== undefined) output.title = textField(input.title, 200, 'Titre', true);
    if (input.description !== undefined) output.description = textField(input.description, 2000, 'Description');
    if (input.status !== undefined) {
        if (!['todo', 'running', 'blocked', 'done'].includes(input.status)) throw new Error('Statut invalide.');
        output.status = input.status;
    }
    if (input.assignee_id !== undefined) {
        if (input.assignee_id !== null && !isProjectUuid(input.assignee_id)) throw new Error('Responsable invalide.');
        output.assignee_id = input.assignee_id;
    }
    if (input.due_date !== undefined) {
        const date = input.due_date;
        if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Date invalide (AAAA-MM-JJ).');
        output.due_date = date;
    }
    if (input.archived_at !== undefined) output.archived_at = input.archived_at;
    return output;
}

function failure(error: unknown): Error {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (['42P01', 'PGRST205'].includes(code)) return new Error('Projets indisponibles : le service doit être activé.');
    if (['42501', '23514', '23503'].includes(code)) return new Error('Écriture refusée : vérifiez vos droits, le projet et le responsable actuel. Rechargez les données.');
    return new Error('Le serveur est indisponible ou la requête a été refusée. Réessayez.');
}

/** Direct authenticated CRUD. RLS/SQL are authoritative; there is no local cache. */
export function createProjectRepo(scope: ProjectScope, client: SupabaseClient<Database> | null = supabase) {
    const ensureCurrent = () => { if (!scope.isCurrent() || scope.signal?.aborted) throw expired(); };
    const connection = async () => {
        ensureCurrent();
        if (!client || !scope.userId || !scope.accessToken || !isProjectUuid(scope.workspaceId)) throw new Error('Une session connectée et un espace accessible sont nécessaires.');
        const { data, error } = await client.auth.getSession();
        ensureCurrent();
        if (error || data.session?.user.id !== scope.userId || data.session.access_token !== scope.accessToken) throw expired();
        return client;
    };
    const result = async <T>(request: (signal: AbortSignal) => PromiseLike<{ data: T; error: unknown }> & { setHeader: (name: string, value: string) => PromiseLike<{ data: T; error: unknown }> }): Promise<NonNullable<T>> => {
        ensureCurrent();
        const controller = new AbortController();
        const abort = () => controller.abort();
        const timer = setTimeout(abort, 15_000);
        scope.signal?.addEventListener('abort', abort, { once: true });
        try {
            // The shared client's session can change after connection(). Pin the
            // captured identity at the request itself, including retry/recovery.
            const response = await request(controller.signal).setHeader('Authorization', `Bearer ${scope.accessToken}`);
            await connection();
            if (controller.signal.aborted) throw new Error('Délai de réponse dépassé. Réessayez.');
            if (response.error) throw failure(response.error);
            if (response.data == null) throw new Error('Objet modifié ou inaccessible : vos droits ont pu changer. Rechargez avant de réessayer.');
            return response.data;
        } finally {
            clearTimeout(timer);
            scope.signal?.removeEventListener('abort', abort);
        }
    };
    const validId = (id: string) => { if (!isProjectUuid(id)) throw new Error('Identifiant invalide.'); };
    const validVersion = (version: number) => { if (!Number.isSafeInteger(version) || version < 1) throw new Error('Version invalide.'); };
    const allPages = async <T>(page: (from: number, to: number) => Promise<T[]>): Promise<T[]> => {
        const rows: T[] = [];
        for (let index = 0; index < 20; index++) {
            await connection();
            const batch = await page(index * 100, index * 100 + 99);
            rows.push(...batch);
            if (batch.length < 100) return rows;
        }
        throw new Error('Liste trop volumineuse pour ce pilote (limite de 2 000 éléments). Aucun résultat partiel présenté.');
    };
    const recover = async <T extends Record<string, unknown>>(insert: () => Promise<T>, reread: () => Promise<T>, payload: Record<string, unknown>): Promise<T> => {
        try { return await insert(); }
        catch {
            // Never retry an INSERT automatically. The form retains its UUID on retry.
            await connection();
            let row: T;
            try { row = await reread(); }
            catch {
                await connection();
                throw new Error('Confirmation de création impossible. Vous pouvez réessayer avec le même formulaire, sans doublon.');
            }
            if (Object.entries(payload).some(([key, value]) => row[key] !== value)) throw new Error('Conflit : cet identifiant existe avec un contenu différent. Rechargez les données avant de poursuivre.');
            return row;
        }
    };
    return {
        async getRole() {
            const db = await connection();
            const row = await result(signal => db.from('workspace_members').select('role').eq('workspace_id', scope.workspaceId).eq('user_id', scope.userId).abortSignal(signal).maybeSingle());
            return row.role;
        },
        async listProjects() {
            const db = await connection();
            return allPages((from, to) => result(signal => db.from('projects').select('*').eq('workspace_id', scope.workspaceId).order('created_at', { ascending: false }).order('id').range(from, to).abortSignal(signal)));
        },
        async getProject(id: string) {
            validId(id);
            const db = await connection();
            return result(signal => db.from('projects').select('*').eq('workspace_id', scope.workspaceId).eq('id', id).abortSignal(signal).maybeSingle());
        },
        async listTasks(projectId: string) {
            validId(projectId);
            const db = await connection();
            return allPages((from, to) => result(signal => db.from('project_tasks').select('*').eq('workspace_id', scope.workspaceId).eq('project_id', projectId).order('created_at', { ascending: true }).order('id').range(from, to).abortSignal(signal)));
        },
        async listMembers(): Promise<ProjectMember[]> {
            const db = await connection();
            const members = await allPages((from, to) => result(signal => db.from('workspace_members').select('user_id').eq('workspace_id', scope.workspaceId).order('user_id').range(from, to).abortSignal(signal)));
            if (!members.length) return [];
            const profiles: { id: string; display_name: string | null }[] = [];
            for (let offset = 0; offset < members.length; offset += 100) {
                await connection();
                profiles.push(...await result(signal => db.from('profiles').select('id,display_name').in('id', members.slice(offset, offset + 100).map(m => m.user_id)).order('id').range(0, 99).abortSignal(signal)));
            }
            return members.map(m => ({ id: m.user_id, label: profiles.find(p => p.id === m.user_id)?.display_name?.trim() || `Membre (${m.user_id})` }));
        },
        async createProject(input: NewProject) {
            validId(input.id);
            const payload = { id: input.id, workspace_id: scope.workspaceId, name: textField(input.name, 160, 'Nom', true), description: textField(input.description ?? '', 500, 'Description') };
            const db = await connection();
            return recover(
                () => result(signal => db.from('projects').insert(payload).select('*').abortSignal(signal).single()),
                () => result(signal => db.from('projects').select('*').eq('workspace_id', scope.workspaceId).eq('id', input.id).abortSignal(signal).maybeSingle()),
                payload,
            );
        },
        async updateProject(id: string, version: number, input: ProjectChanges) {
            validId(id); validVersion(version);
            const payload = { ...projectChanges(input), version: version + 1 };
            const db = await connection();
            return result(signal => db.from('projects').update(payload).eq('workspace_id', scope.workspaceId).eq('id', id).eq('version', version).select('*').abortSignal(signal).maybeSingle());
        },
        async createTask(projectId: string, input: NewTask) {
            validId(projectId); validId(input.id);
            const fields = taskChanges({ description: input.description ?? '', status: input.status ?? 'todo', assignee_id: input.assignee_id ?? null, due_date: input.due_date ?? null });
            const payload = { id: input.id, workspace_id: scope.workspaceId, project_id: projectId, title: textField(input.title, 200, 'Titre', true), description: fields.description!, status: fields.status!, assignee_id: fields.assignee_id!, due_date: fields.due_date! };
            const db = await connection();
            return recover(
                () => result(signal => db.from('project_tasks').insert(payload).select('*').abortSignal(signal).single()),
                () => result(signal => db.from('project_tasks').select('*').eq('workspace_id', scope.workspaceId).eq('project_id', projectId).eq('id', input.id).abortSignal(signal).maybeSingle()),
                payload,
            );
        },
        async updateTask(projectId: string, id: string, version: number, input: TaskChanges) {
            validId(projectId); validId(id); validVersion(version);
            const payload = { ...taskChanges(input), version: version + 1 };
            const db = await connection();
            return result(signal => db.from('project_tasks').update(payload).eq('workspace_id', scope.workspaceId).eq('project_id', projectId).eq('id', id).eq('version', version).select('*').abortSignal(signal).maybeSingle());
        },
    };
}

export type ProjectRepo = ReturnType<typeof createProjectRepo>;
