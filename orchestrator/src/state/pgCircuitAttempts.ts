import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';

export class CircuitAttemptError extends Error {
    constructor(readonly code: string) { super(code); this.name = 'CircuitAttemptError'; }
}
export interface CircuitAttemptKey { runId: string; runVersion: number; stepId: string }
export interface CircuitAttemptOwner extends CircuitAttemptKey { fencingToken: string }
export type CircuitAttemptStatus = 'reserved' | 'dispatched' | 'uncertain' | 'accepted';
export interface CircuitAttemptReceipt extends CircuitAttemptKey {
    status: CircuitAttemptStatus; payloadSha256: string; leaseUntil: string; jobId: string | null;
}
interface Row {
    run_id: string; run_version: number; step_id: string; payload_sha256: string;
    fencing_token: string; status: CircuitAttemptStatus; lease_until: string | Date;
    job_id: string | null; lease_valid: boolean;
}
interface RunState {
    version: number; status: string; currentStepId: string;
    history?: Array<{ stepId: string; version: number; kind: string }>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(key: CircuitAttemptKey): void {
    if (!uuid.test(key.runId) || !Number.isInteger(key.runVersion) || key.runVersion < 1 || typeof key.stepId !== 'string' || !key.stepId.trim() || key.stepId.length > 128) throw new CircuitAttemptError('INVALID_ATTEMPT_KEY');
}
function receipt(row: Row): CircuitAttemptReceipt {
    return { runId: row.run_id, runVersion: row.run_version, stepId: row.step_id, payloadSha256: row.payload_sha256,
        status: row.status, leaseUntil: new Date(row.lease_until).toISOString(), jobId: row.job_id };
}

/**
 * Internal protocol only: callers must validate project authorization and the
 * future step-execution grant. schedule:create is NOT such a grant.
 * Persist the hash of the full qualified Engine request (origin + engine +
 * prompt/options) here, never the prompt or credential. Commit markDispatched
 * BEFORE the single external POST. A thrown/replayed dispatch never permits POST.
 * This module neither contacts Engine nor advances an execution.
 */
export class PgCircuitAttempts {
    constructor(private readonly sql: Sql, private readonly workspaceId: string) {
        if (!uuid.test(workspaceId)) throw new CircuitAttemptError('INVALID_WORKSPACE');
    }

    private async lockReady(sql: Sql, key: CircuitAttemptKey): Promise<RunState> {
        const runs = await sql<{ version: number; state: RunState }[]>`
            select version,state from public.circuit_executions where id=${key.runId} and workspace_id=${this.workspaceId} for update
        `;
        const run = runs[0];
        if (!run) throw new CircuitAttemptError('RUN_NOT_FOUND');
        if (run.version !== key.runVersion || run.state.version !== key.runVersion || run.state.currentStepId !== key.stepId) throw new CircuitAttemptError('STALE_EXECUTION');
        if (run.state.status !== 'ready') throw new CircuitAttemptError('STEP_NOT_READY');
        return run.state;
    }

    private async locked(sql: Sql, key: CircuitAttemptKey): Promise<Row | undefined> {
        const rows = await sql<Row[]>`
            select *,lease_until > clock_timestamp() as lease_valid from public.circuit_step_attempts
            where workspace_id=${this.workspaceId} and run_id=${key.runId} and run_version=${key.runVersion} and step_id=${key.stepId} for update
        `;
        return rows[0];
    }

    async reserve(input: CircuitAttemptKey & { payloadSha256: string; leaseSeconds?: number }): Promise<{ receipt: CircuitAttemptReceipt; fencingToken: string }> {
        validate(input);
        const leaseSeconds = input.leaseSeconds ?? 60;
        if (!/^[a-f0-9]{64}$/.test(input.payloadSha256) || !Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 3600) throw new CircuitAttemptError('INVALID_ATTEMPT_INPUT');
        return await this.sql.begin(async transaction => {
            const sql = transaction as unknown as Sql;
            const run = await this.lockReady(sql, input);
            const existing = await this.locked(sql, input);
            if (existing) {
                if (existing.payload_sha256 !== input.payloadSha256) throw new CircuitAttemptError('ATTEMPT_PAYLOAD_CONFLICT');
                if (existing.status !== 'reserved') throw new CircuitAttemptError(existing.status === 'uncertain' ? 'DELIVERY_UNCERTAIN' : 'ATTEMPT_ALREADY_DISPATCHED');
                if (existing.lease_valid) throw new CircuitAttemptError('ATTEMPT_BUSY');
            }
            const unresolved = await sql<{ run_version: number; status: CircuitAttemptStatus }[]>`
                select run_version,status from public.circuit_step_attempts where workspace_id=${this.workspaceId} and run_id=${input.runId}
                    and step_id=${input.stepId} and run_version<>${input.runVersion} and status in ('dispatched','uncertain','accepted')
            `;
            // A pause/resume changes run.version without consuming the job.
            // Only a completed step permits a later correction to generate again.
            if (unresolved.some(previous => previous.status !== 'accepted' ||
                !run.history?.some(event => event.stepId === input.stepId && event.kind === 'completed' && event.version >= previous.run_version && event.version < input.runVersion))) {
                throw new CircuitAttemptError('PREVIOUS_DELIVERY_UNRESOLVED');
            }
            const fencingToken = randomUUID();
            const rows = await sql<Row[]>`
                insert into public.circuit_step_attempts(run_id,workspace_id,run_version,step_id,payload_sha256,fencing_token,status,lease_until)
                values(${input.runId},${this.workspaceId},${input.runVersion},${input.stepId},${input.payloadSha256},${fencingToken},'reserved',clock_timestamp()+${leaseSeconds}*interval '1 second')
                on conflict(run_id,run_version,step_id) do update set fencing_token=excluded.fencing_token,
                    lease_until=excluded.lease_until,updated_at=clock_timestamp()
                returning *,true as lease_valid
            `;
            return { receipt: receipt(rows[0]!), fencingToken };
        }) as unknown as { receipt: CircuitAttemptReceipt; fencingToken: string };
    }

    async markDispatched(owner: CircuitAttemptOwner): Promise<CircuitAttemptReceipt> {
        validate(owner);
        if (!uuid.test(owner.fencingToken)) throw new CircuitAttemptError('STALE_ATTEMPT');
        return await this.sql.begin(async transaction => {
            const sql = transaction as unknown as Sql;
            await this.lockReady(sql, owner);
            const row = await this.locked(sql, owner);
            if (!row || row.fencing_token !== owner.fencingToken) throw new CircuitAttemptError('STALE_ATTEMPT');
            if (row.status !== 'reserved') throw new CircuitAttemptError('ATTEMPT_ALREADY_DISPATCHED');
            if (!row.lease_valid) throw new CircuitAttemptError('LEASE_EXPIRED');
            const rows = await sql<Row[]>`
                update public.circuit_step_attempts set status='dispatched',dispatched_at=clock_timestamp(),updated_at=clock_timestamp()
                where workspace_id=${this.workspaceId} and run_id=${owner.runId} and run_version=${owner.runVersion} and step_id=${owner.stepId}
                returning *,true as lease_valid
            `;
            return receipt(rows[0]!);
        }) as unknown as CircuitAttemptReceipt;
    }

    async recordAcceptedJob(owner: CircuitAttemptOwner, jobId: string): Promise<CircuitAttemptReceipt> {
        validate(owner);
        if (!uuid.test(owner.fencingToken) || !uuid.test(jobId)) throw new CircuitAttemptError('INVALID_JOB_RECEIPT');
        return await this.sql.begin(async transaction => {
            const sql = transaction as unknown as Sql;
            const row = await this.locked(sql, owner);
            if (!row || row.fencing_token !== owner.fencingToken) throw new CircuitAttemptError('STALE_ATTEMPT');
            if (row.status === 'accepted') {
                if (row.job_id !== jobId) throw new CircuitAttemptError('JOB_RECEIPT_CONFLICT');
                return receipt(row);
            }
            if (row.status !== 'dispatched' && row.status !== 'uncertain') throw new CircuitAttemptError('ATTEMPT_NOT_DISPATCHED');
            const rows = await sql<Row[]>`
                update public.circuit_step_attempts set status='accepted',job_id=${jobId},updated_at=clock_timestamp()
                where workspace_id=${this.workspaceId} and run_id=${owner.runId} and run_version=${owner.runVersion} and step_id=${owner.stepId}
                returning *,lease_until > clock_timestamp() as lease_valid
            `;
            return receipt(rows[0]!);
        }) as unknown as CircuitAttemptReceipt;
    }

    async recoverExpired(key: CircuitAttemptKey): Promise<CircuitAttemptReceipt> {
        validate(key);
        await this.sql`
            update public.circuit_step_attempts set status='uncertain',updated_at=clock_timestamp()
            where workspace_id=${this.workspaceId} and run_id=${key.runId} and run_version=${key.runVersion} and step_id=${key.stepId}
                and status='dispatched' and lease_until<=clock_timestamp()
        `;
        return this.getReceipt(key);
    }

    async getReceipt(key: CircuitAttemptKey): Promise<CircuitAttemptReceipt> {
        validate(key);
        const rows = await this.sql<Row[]>`
            select *,lease_until > clock_timestamp() as lease_valid from public.circuit_step_attempts
            where workspace_id=${this.workspaceId} and run_id=${key.runId} and run_version=${key.runVersion} and step_id=${key.stepId}
        `;
        if (!rows[0]) throw new CircuitAttemptError('ATTEMPT_NOT_FOUND');
        return receipt(rows[0]);
    }
}
