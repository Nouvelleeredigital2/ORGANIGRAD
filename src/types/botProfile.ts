/**
 * Bot conversationnel Hermès, paramétrable dans Organigrad.
 *
 * Une fiche structurée par bot : le prompt système livré au lecteur Telegram
 * est COMPILÉ depuis ces champs (cf. `bots/compileBotPrompt.ts`), jamais édité
 * à la main. Chaque bot est aussi un nœud AGENT_IA de l'organigramme, sous le
 * même identifiant, pour apparaître dans la vue Orchestration.
 */

export type BotFamily = 'veilleur' | 'redacteur' | 'design' | 'gardien';

export const BOT_FAMILIES: readonly BotFamily[] = ['veilleur', 'redacteur', 'design', 'gardien'];

export const BOT_FAMILY_LABEL: Record<BotFamily, string> = {
    veilleur: 'Veilleur',
    redacteur: 'Rédacteur',
    design: 'Design',
    gardien: 'Gardien de marque',
};

/** Réseaux connus des rédacteurs. Liste ouverte : une valeur libre reste acceptée. */
export const BOT_NETWORKS = ['instagram', 'linkedin', 'facebook', 'tiktok', 'x', 'pinterest', 'youtube'] as const;

export const BOT_NETWORK_LABEL: Record<string, string> = {
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    x: 'X',
    pinterest: 'Pinterest',
    youtube: 'YouTube',
};

export interface BotSource {
    label: string;
    url: string;
    note?: string;
}

export interface BotModelSettings {
    /** Ex. 'ollama-cloud'. Informatif : le lecteur choisit son fournisseur. */
    provider?: string;
    /** Ex. 'gpt-oss:120b'. */
    model?: string;
    /** 0 a 2. Bas pour les livrables de production. */
    temperature?: number;
}

export interface BotProfile {
    id: string;
    /** Version de lecture (verrou optimiste cote Supabase). */
    updated_at?: string;
    /** Identifiant runtime du lecteur Hermes, ex. 'anita.instagram.bot'. */
    runtimeId: string;
    /** Fichier lu par le lecteur, ex. 'anita.instagram.bot.txt' ou 'Hannah.txt'. */
    fileName: string;
    displayName: string;
    family: BotFamily;
    brand: string | null;
    network: string | null;
    telegramUsername: string | null;
    mission: string;
    personality: string;
    research: string;
    watch: string;
    deliverables: string;
    method: string;
    limits: string;
    usefulContext: string;
    sources: BotSource[];
    model: BotModelSettings;
    enabled: boolean;
    compiledPrompt: string;
    compiledSha256: string;
}

export const RUNTIME_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.txt$/;
export const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

/** Bornes alignees sur les contraintes SQL de `bot_profiles`. */
export const BOT_FIELD_MAX = {
    displayName: 80,
    brand: 120,
    network: 40,
    mission: 2000,
    personality: 2000,
    research: 4000,
    watch: 4000,
    deliverables: 4000,
    method: 8000,
    limits: 4000,
    usefulContext: 2000,
    compiledPrompt: 32000,
} as const;

export function emptyBotProfile(id: string, family: BotFamily = 'redacteur'): BotProfile {
    return {
        id,
        runtimeId: '',
        fileName: '',
        displayName: '',
        family,
        brand: null,
        network: family === 'redacteur' ? 'instagram' : null,
        telegramUsername: null,
        mission: '',
        personality: '',
        research: '',
        watch: '',
        deliverables: '',
        method: '',
        limits: '',
        usefulContext: '',
        sources: [],
        model: { provider: 'ollama-cloud', model: 'gpt-oss:120b', temperature: 0.3 },
        enabled: true,
        compiledPrompt: '',
        compiledSha256: '',
    };
}

/**
 * Valide une fiche avant enregistrement. Renvoie la liste des defauts, vide si
 * la fiche est acceptable. Les bornes miroir des contraintes SQL evitent un
 * refus serveur muet apres un long travail de saisie.
 */
export function validateBotProfile(p: BotProfile): string[] {
    const errors: string[] = [];
    if (!p.displayName.trim() || p.displayName.length > BOT_FIELD_MAX.displayName) {
        errors.push('Nom affiche : 1 a 80 caracteres.');
    }
    if (!RUNTIME_ID_PATTERN.test(p.runtimeId)) {
        errors.push('Identifiant runtime : minuscules, chiffres, points, tirets (ex. anita.instagram.bot).');
    }
    if (!FILE_NAME_PATTERN.test(p.fileName)) {
        errors.push('Nom de fichier : lettres, chiffres, points, tirets, termine par .txt.');
    }
    if (!BOT_FAMILIES.includes(p.family)) errors.push('Famille inconnue.');
    if (p.family === 'redacteur' && !p.network) errors.push('Un redacteur doit avoir un reseau.');
    if (p.brand && p.brand.length > BOT_FIELD_MAX.brand) errors.push('Marque : 120 caracteres maximum.');
    if (p.network && p.network.length > BOT_FIELD_MAX.network) errors.push('Reseau : 40 caracteres maximum.');
    if (p.telegramUsername && !TELEGRAM_USERNAME_PATTERN.test(p.telegramUsername)) {
        errors.push('Nom Telegram : lettres, chiffres et tirets bas uniquement, sans @.');
    }
    const texts: Array<[keyof typeof BOT_FIELD_MAX, string, string]> = [
        ['mission', p.mission, 'Mission'],
        ['personality', p.personality, 'Personnalite'],
        ['research', p.research, 'Recherche'],
        ['watch', p.watch, 'Veille'],
        ['deliverables', p.deliverables, 'Livrables'],
        ['method', p.method, 'Methode'],
        ['limits', p.limits, 'Limites'],
        ['usefulContext', p.usefulContext, 'Contexte utile'],
    ];
    for (const [key, value, label] of texts) {
        if (value.length > BOT_FIELD_MAX[key]) errors.push(`${label} : ${BOT_FIELD_MAX[key]} caracteres maximum.`);
    }
    if (!p.mission.trim()) errors.push('Mission : obligatoire.');
    for (const s of p.sources) {
        if (!s.label.trim() || !/^https?:\/\/\S+$/.test(s.url)) {
            errors.push(`Source « ${s.label || s.url || '?'} » : libelle et URL http(s) requis.`);
        }
    }
    if (p.model.temperature !== undefined && (p.model.temperature < 0 || p.model.temperature > 2)) {
        errors.push('Temperature : entre 0 et 2.');
    }
    return errors;
}
