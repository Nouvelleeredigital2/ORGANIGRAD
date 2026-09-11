import type { Sql } from 'postgres';
import { compileBotPrompt, sha256Hex, type BotFamily, type BotModelSettings, type BotProfile, type BotSource } from '../domain/botProfile.js';
import type { JsonValue } from '../domain/types.js';

export class BotNotFoundError extends Error {
    constructor(public readonly botId: string) {
        super(`Bot introuvable : ${botId}`);
        this.name = 'BotNotFoundError';
    }
}

export class BotOptimisticConcurrencyError extends Error {
    constructor(
        public readonly botId: string,
        public readonly expectedUpdatedAt?: string,
    ) {
        super(`Conflit de version pour le bot : ${botId}`);
        this.name = 'BotOptimisticConcurrencyError';
    }
}

export class BotValidationError extends Error {
    constructor(public readonly field: string, message: string) {
        super(message);
        this.name = 'BotValidationError';
    }
}

interface DbRow {
    id: string;
    workspace_id: string;
    runtime_id: string;
    file_name: string;
    display_name: string;
    family: BotFamily;
    brand: string | null;
    network: string | null;
    telegram_username: string | null;
    mission: string;
    personality: string;
    research: string;
    watch: string;
    deliverables: string;
    method: string;
    limits: string;
    useful_context: string;
    sources: unknown;
    model: unknown;
    enabled: boolean;
    compiled_prompt: string;
    compiled_sha256: string;
    updated_at: string;
    updated_at_text?: string;
}

/** Corps accepté en création/mise à jour — les champs dérivés (compiled*) ne s'y trouvent pas : le serveur les recalcule toujours. */
export interface BotMutationInput {
    id: string;
    updated_at?: string;
    runtimeId: string;
    fileName: string;
    displayName: string;
    family: BotFamily;
    brand?: string | null;
    network?: string | null;
    telegramUsername?: string | null;
    mission?: string;
    personality?: string;
    research?: string;
    watch?: string;
    deliverables?: string;
    method?: string;
    limits?: string;
    usefulContext?: string;
    sources?: BotSource[];
    model?: BotModelSettings;
    enabled?: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUNTIME_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.txt$/;
const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const FAMILIES: readonly BotFamily[] = ['veilleur', 'redacteur', 'design', 'gardien'];

/** Valide et normalise un corps de mutation. Miroir des contraintes SQL — un rejet ici évite un aller-retour 500 opaque. */
export function validateBotMutation(raw: unknown): BotMutationInput {
    if (typeof raw !== 'object' || raw === null) {
        throw new BotValidationError('body', 'Corps de requête invalide');
    }
    const b = raw as Record<string, unknown>;

    if (typeof b.id !== 'string' || !UUID_PATTERN.test(b.id)) {
        throw new BotValidationError('id', 'id invalide (UUID)');
    }
    if ('updated_at' in b && (typeof b.updated_at !== 'string' || Number.isNaN(Date.parse(b.updated_at as string)))) {
        throw new BotValidationError('updated_at', 'updated_at invalide (date ISO)');
    }
    if (typeof b.runtimeId !== 'string' || !RUNTIME_ID_PATTERN.test(b.runtimeId)) {
        throw new BotValidationError('runtimeId', 'runtimeId invalide (minuscules/chiffres/._- , 1-64)');
    }
    if (typeof b.fileName !== 'string' || !FILE_NAME_PATTERN.test(b.fileName)) {
        throw new BotValidationError('fileName', 'fileName invalide (doit finir par .txt)');
    }
    if (typeof b.displayName !== 'string' || b.displayName.trim().length === 0 || b.displayName.length > 80) {
        throw new BotValidationError('displayName', 'displayName invalide (1-80 caractères)');
    }
    if (typeof b.family !== 'string' || !FAMILIES.includes(b.family as BotFamily)) {
        throw new BotValidationError('family', 'family invalide (veilleur|redacteur|design|gardien)');
    }
    if (b.family === 'redacteur' && !b.network) {
        throw new BotValidationError('network', 'network requis pour un rédacteur');
    }
    if (b.telegramUsername != null && (typeof b.telegramUsername !== 'string' || !TELEGRAM_USERNAME_PATTERN.test(b.telegramUsername))) {
        throw new BotValidationError('telegramUsername', 'telegramUsername invalide');
    }
    const textField = (key: string, max: number): string => {
        const v = b[key];
        if (v == null) return '';
        if (typeof v !== 'string' || v.length > max) {
            throw new BotValidationError(key, `${key} trop long (max ${max} caractères)`);
        }
        return v;
    };
    const sourcesRaw = Array.isArray(b.sources) ? b.sources : [];
    const sources: BotSource[] = sourcesRaw.map((s, i) => {
        if (typeof s !== 'object' || s === null || typeof (s as Record<string, unknown>).label !== 'string' || typeof (s as Record<string, unknown>).url !== 'string') {
            throw new BotValidationError('sources', `source #${i + 1} invalide (label + url requis)`);
        }
        const rec = s as Record<string, unknown>;
        return { label: rec.label as string, url: rec.url as string, ...(typeof rec.note === 'string' ? { note: rec.note } : {}) };
    });
    const modelRaw = typeof b.model === 'object' && b.model !== null ? (b.model as Record<string, unknown>) : {};
    const model: BotModelSettings = {
        ...(typeof modelRaw.provider === 'string' ? { provider: modelRaw.provider } : {}),
        ...(typeof modelRaw.model === 'string' ? { model: modelRaw.model } : {}),
        ...(typeof modelRaw.temperature === 'number' ? { temperature: modelRaw.temperature } : {}),
    };

    return {
        id: b.id,
        ...(typeof b.updated_at === 'string' ? { updated_at: b.updated_at } : {}),
        runtimeId: b.runtimeId,
        fileName: b.fileName,
        displayName: b.displayName,
        family: b.family as BotFamily,
        brand: typeof b.brand === 'string' ? b.brand : null,
        network: typeof b.network === 'string' ? b.network : null,
        telegramUsername: typeof b.telegramUsername === 'string' ? b.telegramUsername : null,
        mission: textField('mission', 2000),
        personality: textField('personality', 2000),
        research: textField('research', 4000),
        watch: textField('watch', 4000),
        deliverables: textField('deliverables', 4000),
        method: textField('method', 8000),
        limits: textField('limits', 4000),
        usefulContext: textField('usefulContext', 2000),
        sources,
        model,
        enabled: b.enabled !== false,
    };
}

export class PgBotStore {
    constructor(
        private readonly sql: Sql,
        private readonly workspaceId: string,
    ) {}

    private rowToProfile(r: DbRow): BotProfile {
        const profile: BotProfile = {
            id: r.id,
            updated_at: r.updated_at_text ?? r.updated_at,
            runtimeId: r.runtime_id,
            fileName: r.file_name,
            displayName: r.display_name,
            family: r.family,
            brand: r.brand,
            network: r.network,
            telegramUsername: r.telegram_username,
            mission: r.mission,
            personality: r.personality,
            research: r.research,
            watch: r.watch,
            deliverables: r.deliverables,
            method: r.method,
            limits: r.limits,
            usefulContext: r.useful_context,
            sources: Array.isArray(r.sources) ? (r.sources as BotSource[]) : [],
            model: (r.model as BotModelSettings) ?? {},
            enabled: r.enabled,
            compiledPrompt: r.compiled_prompt,
            compiledSha256: r.compiled_sha256,
        };
        // RLS allows members to edit structured fields directly. Stored derived
        // columns are only a cache, never an authority for API reads or exports.
        profile.compiledPrompt = compileBotPrompt(profile);
        profile.compiledSha256 = sha256Hex(profile.compiledPrompt);
        return profile;
    }

    async list(): Promise<BotProfile[]> {
        const rows = await this.sql<DbRow[]>`
            select *, updated_at::text as updated_at_text from public.bot_profiles
             where workspace_id = ${this.workspaceId}
             order by family, display_name
        `;
        return rows.map((r) => this.rowToProfile(r));
    }

    async get(id: string): Promise<BotProfile> {
        const rows = await this.sql<DbRow[]>`
            select *, updated_at::text as updated_at_text from public.bot_profiles
             where workspace_id = ${this.workspaceId} and id = ${id}
             limit 1
        `;
        const row = rows[0];
        if (!row) throw new BotNotFoundError(id);
        return this.rowToProfile(row);
    }

    /**
     * Crée ou met à jour un bot. Le prompt compilé et son empreinte sont
     * TOUJOURS recalculés ici — jamais acceptés depuis le client. C'est ce qui
     * fait de `compiled_sha256` une preuve fiable côté Hermès : elle ne peut
     * dévier des champs source.
     */
    async upsert(input: BotMutationInput): Promise<BotProfile> {
        const draft: BotProfile = {
            id: input.id,
            runtimeId: input.runtimeId,
            fileName: input.fileName,
            displayName: input.displayName,
            family: input.family,
            brand: input.brand ?? null,
            network: input.network ?? null,
            telegramUsername: input.telegramUsername ?? null,
            mission: input.mission ?? '',
            personality: input.personality ?? '',
            research: input.research ?? '',
            watch: input.watch ?? '',
            deliverables: input.deliverables ?? '',
            method: input.method ?? '',
            limits: input.limits ?? '',
            usefulContext: input.usefulContext ?? '',
            sources: input.sources ?? [],
            model: input.model ?? {},
            enabled: input.enabled ?? true,
            compiledPrompt: '',
            compiledSha256: '',
        };
        const compiledPrompt = compileBotPrompt(draft);
        const compiledSha256 = sha256Hex(compiledPrompt);

        if (input.updated_at) {
            const rows = await this.sql<DbRow[]>`
                update public.bot_profiles set
                    runtime_id = ${draft.runtimeId}, file_name = ${draft.fileName},
                    display_name = ${draft.displayName}, family = ${draft.family},
                    brand = ${draft.brand}, network = ${draft.network}, telegram_username = ${draft.telegramUsername},
                    mission = ${draft.mission}, personality = ${draft.personality}, research = ${draft.research},
                    watch = ${draft.watch}, deliverables = ${draft.deliverables}, method = ${draft.method},
                    limits = ${draft.limits}, useful_context = ${draft.usefulContext},
                    sources = ${this.sql.json(draft.sources as unknown as JsonValue)},
                    model = ${this.sql.json(draft.model as unknown as JsonValue)}, enabled = ${draft.enabled},
                    compiled_prompt = ${compiledPrompt}, compiled_sha256 = ${compiledSha256}
                where id = ${draft.id} and workspace_id = ${this.workspaceId}
                    and updated_at::text = ${input.updated_at}
                returning *, updated_at::text as updated_at_text
            `;
            if (!rows[0]) throw new BotOptimisticConcurrencyError(input.id, input.updated_at);
            return this.rowToProfile(rows[0]);
        }

        const rows = await this.sql<DbRow[]>`
            insert into public.bot_profiles
                (id, workspace_id, runtime_id, file_name, display_name, family, brand, network,
                 telegram_username, mission, personality, research, watch, deliverables, method,
                 limits, useful_context, sources, model, enabled, compiled_prompt, compiled_sha256)
            values
                (${draft.id}, ${this.workspaceId}, ${draft.runtimeId}, ${draft.fileName}, ${draft.displayName},
                 ${draft.family}, ${draft.brand}, ${draft.network}, ${draft.telegramUsername},
                 ${draft.mission}, ${draft.personality}, ${draft.research}, ${draft.watch},
                 ${draft.deliverables}, ${draft.method}, ${draft.limits}, ${draft.usefulContext},
                 ${this.sql.json(draft.sources as unknown as JsonValue)}, ${this.sql.json(draft.model as unknown as JsonValue)}, ${draft.enabled},
                 ${compiledPrompt}, ${compiledSha256})
            on conflict (id) do nothing
            returning *, updated_at::text as updated_at_text
        `;
        const row = rows[0];
        if (!row) {
            throw new BotOptimisticConcurrencyError(input.id);
        }
        return this.rowToProfile(row);
    }

    async remove(id: string): Promise<void> {
        await this.sql`
            delete from public.bot_profiles
             where workspace_id = ${this.workspaceId} and id = ${id}
        `;
    }

    /**
     * Paquet de synchronisation Hermès : un fichier par bot ACTIVÉ, prêt à
     * installer dans `/opt/data/pipeline/personas/`. Même forme que
     * `profiles-payload.json` produit historiquement par
     * `hermes-veille/deployment/prepare_profiles.py`, pour rester compatible
     * avec `install_profiles.py` côté VPS sans le réécrire.
     */
    async bundle(): Promise<{ files: Record<string, { agent: string; content: string; sha256: string }> }> {
        const profiles = await this.list();
        const files: Record<string, { agent: string; content: string; sha256: string }> = {};
        for (const p of profiles) {
            if (!p.enabled) continue;
            files[p.fileName] = { agent: p.runtimeId, content: p.compiledPrompt, sha256: p.compiledSha256 };
        }
        return { files };
    }
}
