import type { Sql, TransactionSql } from 'postgres';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9_-]{43}$/;

export class SuiteLaunchError extends Error {
    constructor(readonly status: number, readonly code: string) { super(code); }
}

export interface NativeRef {
    nativeWorkspaceId: string;
    nativeProjectId: string;
    canonicalUrl: string;
}

export interface LaunchRedemption {
    launchId: string;
    suiteUserId: string;
    workspaceId: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    idempotencyKey: string;
    project: { scopeId: string; name: string };
    nativeSpace: { id: string; nativeRef: NativeRef | null } | null;
    accountLink: { nativeAccountId: string; nativeWorkspaceId: string | null } | null;
    confirmBefore: string;
}

export interface PrepareCommand {
    idempotencyKey: string;
    contentSha256: string;
    workspaceId: string;
    companyId: string;
    scopeId: string;
    projectName: string;
    appId: 'organigrad';
    operation: 'create' | 'attach';
    nativeRef: NativeRef | null;
    requestedBy: string;
    nativeAccountId: string | null;
}

export interface GrantCommand {
    idempotencyKey: string;
    workspaceId: string;
    companyId: string;
    scopeId: string;
    appId: 'organigrad';
    nativeRef: NativeRef;
    ownerNativeAccountId: string | null;
    nativeAccountId: string;
    requestedBy: string;
}

export type PrepareResult =
    | { state: 'ready'; nativeRef: NativeRef; receipt: string }
    | { state: 'action_required' | 'failed'; message: string };

export interface SuiteHub {
    redeem(code: string): Promise<LaunchRedemption>;
    confirm(launchId: string, nativeAccountId: string, nativeWorkspaceId: string): Promise<void>;
}

export interface SuiteNativeStore {
    open(input: {
        userId: string; workspaceId: string; projectId: string; projectName: string;
        synapseWorkspaceId: string; idempotencyKey: string;
    }): Promise<NativeRef>;
    prepare(command: PrepareCommand): Promise<PrepareResult>;
    lookup(idempotencyKey: string): Promise<PrepareResult | null>;
    grant(command: GrantCommand): Promise<{ state: 'granted'; receipt: string } | { state: 'failed' | 'action_required'; message: string }>;
    revoke(idempotencyKey: string, nativeAccountId: string): Promise<void>;
}

const text = (value: unknown, max = 500): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= max;

function nativeRef(value: unknown): NativeRef {
    if (!value || typeof value !== 'object') throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
    const row = value as Record<string, unknown>;
    if (!text(row.nativeWorkspaceId, 160) || !text(row.nativeProjectId, 160) || !text(row.canonicalUrl, 2048)) {
        throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
    }
    let url: URL;
    try { url = new URL(row.canonicalUrl); } catch { throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
    return { nativeWorkspaceId: row.nativeWorkspaceId, nativeProjectId: row.nativeProjectId, canonicalUrl: url.href };
}

export function parseLaunchRedemption(raw: unknown): LaunchRedemption {
    if (!raw || typeof raw !== 'object') throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
    const row = raw as Record<string, unknown>, project = row.project as Record<string, unknown> | null;
    if (!text(row.launchId, 36) || !UUID.test(row.launchId) || !text(row.suiteUserId, 160) ||
        !text(row.workspaceId, 160) || !text(row.idempotencyKey, 500) ||
        !['owner', 'admin', 'member', 'viewer'].includes(String(row.role)) || !project ||
        !text(project.scopeId, 160) || !UUID.test(project.scopeId) || !text(project.name, 160) ||
        !text(row.confirmBefore, 64) || !Number.isFinite(Date.parse(row.confirmBefore))) {
        throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
    }
    let space: LaunchRedemption['nativeSpace'] = null;
    if (row.nativeSpace !== null) {
        if (!row.nativeSpace || typeof row.nativeSpace !== 'object') throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
        const candidate = row.nativeSpace as Record<string, unknown>;
        if (!text(candidate.id, 160)) throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
        space = { id: candidate.id, nativeRef: candidate.nativeRef === null ? null : nativeRef(candidate.nativeRef) };
    }
    let account: LaunchRedemption['accountLink'] = null;
    if (row.accountLink !== null) {
        if (!row.accountLink || typeof row.accountLink !== 'object') throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
        const candidate = row.accountLink as Record<string, unknown>;
        if (!text(candidate.nativeAccountId, 160) ||
            (candidate.nativeWorkspaceId !== null && !text(candidate.nativeWorkspaceId, 160))) {
            throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID');
        }
        account = { nativeAccountId: candidate.nativeAccountId, nativeWorkspaceId: candidate.nativeWorkspaceId as string | null };
    }
    return { ...(raw as LaunchRedemption), nativeSpace: space, accountLink: account };
}

const safeJson = async (response: Response): Promise<unknown> => {
    try { return await response.json(); } catch { throw new SuiteLaunchError(502, 'SYNAPSE_RESPONSE_INVALID'); }
};

function endpoint(baseUrl: string, path: string) {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' || base.username || base.password) throw new Error('SYNAPSE_URL_INVALID');
    return new URL(path, `${base.origin}/`).href;
}

export function createSuiteHub(baseUrl: string, token: string, fetcher: typeof fetch = fetch): SuiteHub {
    const call = async (path: string, body: unknown) => {
        let response: Response;
        try {
            response = await fetcher(endpoint(baseUrl, path), { method: 'POST', redirect: 'error', cache: 'no-store',
                signal: AbortSignal.timeout(8000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify(body) });
        } catch { throw new SuiteLaunchError(502, 'SYNAPSE_UNAVAILABLE'); }
        if (!response.ok) throw new SuiteLaunchError(response.status === 403 ? 403 : 502, 'SYNAPSE_LAUNCH_REFUSED');
        return safeJson(response);
    };
    return {
        async redeem(code) {
            if (!CODE.test(code)) throw new SuiteLaunchError(400, 'SYNAPSE_CODE_INVALID');
            return parseLaunchRedemption(await call('/api/suite/launch/redeem', { code }));
        },
        async confirm(launchId, nativeAccountId, nativeWorkspaceId) {
            if (!UUID.test(launchId) || !text(nativeAccountId, 160) || !text(nativeWorkspaceId, 160)) throw new SuiteLaunchError(400, 'SYNAPSE_CONFIRM_INVALID');
            await call(`/api/suite/launch/${launchId}/confirm`, { nativeAccountId, nativeWorkspaceId });
        },
    };
}

export function createSuiteLaunchService(hub: SuiteHub, native: SuiteNativeStore, now = () => Date.now()) {
    return {
        async open(code: string, actor: { userId: string; workspaceId: string }) {
            if (!CODE.test(code)) throw new SuiteLaunchError(400, 'SYNAPSE_CODE_INVALID');
            const launch = parseLaunchRedemption(await hub.redeem(code));
            if (Date.parse(launch.confirmBefore) <= now()) throw new SuiteLaunchError(403, 'SYNAPSE_CONFIRM_EXPIRED');
            if (launch.accountLink && (launch.accountLink.nativeAccountId !== actor.userId ||
                (launch.accountLink.nativeWorkspaceId !== null && launch.accountLink.nativeWorkspaceId !== actor.workspaceId))) {
                throw new SuiteLaunchError(409, 'SYNAPSE_ACCOUNT_MISMATCH');
            }
            const expected = launch.nativeSpace?.nativeRef;
            if (expected && (expected.nativeProjectId !== launch.project.scopeId || expected.nativeWorkspaceId !== actor.workspaceId)) {
                throw new SuiteLaunchError(409, 'SYNAPSE_PROJECT_MISMATCH');
            }
            const ref = await native.open({ userId: actor.userId, workspaceId: actor.workspaceId,
                projectId: launch.project.scopeId, projectName: launch.project.name,
                synapseWorkspaceId: launch.workspaceId, idempotencyKey: launch.idempotencyKey });
            if (ref.nativeProjectId !== launch.project.scopeId || ref.nativeWorkspaceId !== actor.workspaceId) {
                throw new SuiteLaunchError(500, 'NATIVE_PROJECT_MISMATCH');
            }
            await hub.confirm(launch.launchId, actor.userId, actor.workspaceId);
            return { projectId: ref.nativeProjectId, workspaceId: ref.nativeWorkspaceId,
                redirect: `/?v=projects&project=${encodeURIComponent(ref.nativeProjectId)}&workspace=${encodeURIComponent(ref.nativeWorkspaceId)}` };
        },
    };
}

type LinkRow = { project_id: string; workspace_id: string; synapse_workspace_id: string; idempotency_key: string; created_by: string };

export class PgSuiteNativeStore implements SuiteNativeStore {
    constructor(private readonly sql: Sql, private readonly appUrl: string) {}
    private ref(row: Pick<LinkRow, 'project_id' | 'workspace_id'>): NativeRef {
        const url = new URL('/', this.appUrl); url.searchParams.set('v', 'projects'); url.searchParams.set('project', row.project_id); url.searchParams.set('workspace', row.workspace_id);
        return { nativeWorkspaceId: row.workspace_id, nativeProjectId: row.project_id, canonicalUrl: url.href };
    }
    private async timeouts(tx: TransactionSql) { await tx`select set_config('statement_timeout','5s',true), set_config('lock_timeout','2s',true)`; }
    async open(input: { userId: string; workspaceId: string; projectId: string; projectName: string; synapseWorkspaceId: string; idempotencyKey: string }): Promise<NativeRef> {
        return this.sql.begin(async tx => {
            await this.timeouts(tx);
            const members = await tx<{ role: string }[]>`select role from public.workspace_members where workspace_id=${input.workspaceId} and user_id=${input.userId} for share`;
            if (!['owner', 'admin', 'member'].includes(members[0]?.role ?? '')) throw new SuiteLaunchError(403, 'NATIVE_PROJECT_WRITE_FORBIDDEN');
            await tx`insert into public.projects(id,workspace_id,name,description) values(${input.projectId},${input.workspaceId},${input.projectName},'Projet ouvert depuis Synapse.') on conflict(id) do nothing`;
            const projects = await tx<{ id: string; workspace_id: string }[]>`select id,workspace_id from public.projects where id=${input.projectId}`;
            if (projects[0]?.workspace_id !== input.workspaceId) throw new SuiteLaunchError(409, 'NATIVE_PROJECT_CONFLICT');
            await tx`insert into public.synapse_project_links(project_id,workspace_id,synapse_workspace_id,idempotency_key,created_by)
                values(${input.projectId},${input.workspaceId},${input.synapseWorkspaceId},${input.idempotencyKey},${input.userId}) on conflict do nothing`;
            const links = await tx<LinkRow[]>`select project_id,workspace_id,synapse_workspace_id,idempotency_key,created_by from public.synapse_project_links where project_id=${input.projectId}`;
            const link = links[0];
            if (!link || link.workspace_id !== input.workspaceId || link.synapse_workspace_id !== input.synapseWorkspaceId || link.idempotency_key !== input.idempotencyKey || link.created_by !== input.userId) {
                throw new SuiteLaunchError(409, 'SYNAPSE_LINK_CONFLICT');
            }
            return this.ref(link);
        });
    }
    async lookup(idempotencyKey: string): Promise<PrepareResult | null> {
        const rows = await this.sql<LinkRow[]>`select project_id,workspace_id,synapse_workspace_id,idempotency_key,created_by from public.synapse_project_links where idempotency_key=${idempotencyKey}`;
        return rows[0] ? { state: 'ready', nativeRef: this.ref(rows[0]), receipt: `organigrad:project:${rows[0].project_id}` } : null;
    }
    async prepare(command: PrepareCommand): Promise<PrepareResult> {
        if (command.operation === 'attach') return { state: 'action_required', message: 'Associez le projet existant depuis OrganiGrad.' };
        if (!command.nativeAccountId) return { state: 'action_required', message: 'Ouvrez OrganiGrad une première fois depuis Synapse.' };
        const found = await this.lookup(command.idempotencyKey);
        if (!found || found.state !== 'ready' || found.nativeRef.nativeProjectId !== command.scopeId) return { state: 'action_required', message: 'Ouvrez ce projet une première fois dans OrganiGrad.' };
        const member = await this.sql<{ exists: boolean }[]>`select exists(select 1 from public.workspace_members where workspace_id=${found.nativeRef.nativeWorkspaceId} and user_id=${command.nativeAccountId}) as exists`;
        return member[0]?.exists ? found : { state: 'action_required', message: 'Le compte OrganiGrad rattaché n accède plus à cet espace.' };
    }
    async grant(command: GrantCommand) {
        const found = await this.lookup(command.idempotencyKey);
        if (!found || found.state !== 'ready' || JSON.stringify(found.nativeRef) !== JSON.stringify(command.nativeRef)) return { state: 'failed' as const, message: 'Projet OrganiGrad incohérent.' };
        try {
            return await this.sql.begin(async tx => {
                await this.timeouts(tx);
                const current = await tx<{ role: string }[]>`select role from public.workspace_members where workspace_id=${command.nativeRef.nativeWorkspaceId} and user_id=${command.nativeAccountId} for update`;
                const created = current.length === 0;
                if (created) await tx`insert into public.workspace_members(workspace_id,user_id,role) values(${command.nativeRef.nativeWorkspaceId},${command.nativeAccountId},'member')`;
                await tx`insert into public.synapse_project_grants(project_id,workspace_id,user_id,membership_created) values(${command.scopeId},${command.nativeRef.nativeWorkspaceId},${command.nativeAccountId},${created}) on conflict(project_id,user_id) do update set membership_created=public.synapse_project_grants.membership_created or excluded.membership_created`;
                return { state: 'granted' as const, receipt: `organigrad:member:${command.scopeId}:${command.nativeAccountId}` };
            });
        } catch { return { state: 'action_required' as const, message: 'Le compte OrganiGrad doit exister avant l invitation.' }; }
    }
    async revoke(idempotencyKey: string, nativeAccountId: string): Promise<void> {
        await this.sql.begin(async tx => {
            await this.timeouts(tx);
            const links = await tx<LinkRow[]>`select project_id,workspace_id,synapse_workspace_id,idempotency_key,created_by from public.synapse_project_links where idempotency_key=${idempotencyKey} for update`;
            const link = links[0]; if (!link) return;
            const grants = await tx<{ membership_created: boolean }[]>`delete from public.synapse_project_grants where project_id=${link.project_id} and user_id=${nativeAccountId} returning membership_created`;
            if (!grants[0]?.membership_created) return;
            const other = await tx<{ exists: boolean }[]>`select exists(select 1 from public.synapse_project_grants where workspace_id=${link.workspace_id} and user_id=${nativeAccountId} and membership_created) as exists`;
            if (!other[0]?.exists) await tx`delete from public.workspace_members where workspace_id=${link.workspace_id} and user_id=${nativeAccountId} and role='member'`;
        });
    }
}

export function parsePrepareCommand(raw: unknown): PrepareCommand {
    if (!raw || typeof raw !== 'object') throw new SuiteLaunchError(400, 'PREPARE_COMMAND_INVALID');
    const r = raw as Record<string, unknown>;
    if (!text(r.idempotencyKey) || !text(r.contentSha256, 64) || !/^[a-f0-9]{64}$/.test(r.contentSha256) || !text(r.workspaceId, 160) ||
        typeof r.companyId !== 'string' || r.companyId.length > 160 || !text(r.scopeId, 160) || !UUID.test(r.scopeId) || !text(r.projectName, 160) ||
        r.appId !== 'organigrad' || !['create', 'attach'].includes(String(r.operation)) || !text(r.requestedBy, 160) ||
        (r.nativeAccountId !== null && !text(r.nativeAccountId, 160))) throw new SuiteLaunchError(400, 'PREPARE_COMMAND_INVALID');
    return raw as PrepareCommand;
}

export function parseGrantCommand(raw: unknown): GrantCommand {
    if (!raw || typeof raw !== 'object') throw new SuiteLaunchError(400, 'GRANT_COMMAND_INVALID');
    const r = raw as Record<string, unknown>;
    if (!text(r.idempotencyKey) || !text(r.workspaceId, 160) || typeof r.companyId !== 'string' || !text(r.scopeId, 160) || !UUID.test(r.scopeId) ||
        r.appId !== 'organigrad' || !text(r.nativeAccountId, 160) || !text(r.requestedBy, 160)) throw new SuiteLaunchError(400, 'GRANT_COMMAND_INVALID');
    return { ...(raw as GrantCommand), nativeRef: nativeRef(r.nativeRef) };
}
