/**
 * Limiteur de débit (Phase 4) — borne les envois sortants (Slack/email) pour
 * éviter le flood / l'abus de relais à partir d'un flux emballé.
 *
 * Fenêtre fixe par clé (ex. workspaceId), horloge injectable pour des tests
 * déterministes. En mémoire (un orchestrateur = un process) — suffisant pour la
 * protection anti-flood ; pour un déploiement multi-instances, basculer sur un
 * store partagé (Redis).
 */

export interface RateLimiter {
    /** Tente de consommer un jeton pour `key`. `true` si autorisé, `false` si dépassé. */
    tryConsume(key: string): boolean;
}

export interface FixedWindowOptions {
    /** Nombre maximal d'événements autorisés par fenêtre. */
    max: number;
    /** Durée de la fenêtre en millisecondes. */
    windowMs: number;
    /** Source d'horloge (tests). */
    now?: () => number;
}

export class FixedWindowRateLimiter implements RateLimiter {
    private readonly max: number;
    private readonly windowMs: number;
    private readonly now: () => number;
    private readonly buckets = new Map<string, { start: number; count: number }>();

    constructor(opts: FixedWindowOptions) {
        this.max = opts.max;
        this.windowMs = opts.windowMs;
        this.now = opts.now ?? (() => Date.now());
    }

    tryConsume(key: string): boolean {
        const t = this.now();
        const b = this.buckets.get(key);
        if (!b || t - b.start >= this.windowMs) {
            this.buckets.set(key, { start: t, count: 1 });
            return true;
        }
        if (b.count < this.max) {
            b.count++;
            return true;
        }
        return false;
    }
}

/** Limiteur passe-tout (désactive la limitation). */
export const unlimitedRateLimiter: RateLimiter = {
    tryConsume() {
        return true;
    },
};
