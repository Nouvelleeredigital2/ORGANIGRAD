import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Registre de channels Realtime partagés.
 *
 * Le faux client reproduit FIDÈLEMENT les deux comportements de supabase-js qui
 * font le piège — sans eux, ces tests passeraient sur du code cassé :
 *   1. `channel(topic)` renvoie l'instance EXISTANTE pour un topic déjà connu ;
 *   2. `.on(...)` après `.subscribe()` LÈVE.
 */
const { mockSupabase, mockRegistry } = vi.hoisted(() => {
    class FakeChannel {
        topic: string;
        isSubscribed = false;
        handler?: (payload: unknown) => void;
        statusCb?: (status: string) => void;

        constructor(topic: string) {
            this.topic = topic;
        }
        on(_event: string, _filter: unknown, handler: (payload: unknown) => void) {
            if (this.isSubscribed) {
                throw new Error(
                    `cannot add \`postgres_changes\` callbacks for realtime channel \`${this.topic}\` after \`subscribe()\`.`,
                );
            }
            this.handler = handler;
            return this;
        }
        subscribe(cb?: (status: string) => void) {
            this.isSubscribed = true;
            this.statusCb = cb;
            return this;
        }
        emit(payload: unknown) {
            this.handler?.(payload);
        }
        annoncer(status: string) {
            this.statusCb?.(status);
        }
    }

    const registry = new Map<string, InstanceType<typeof FakeChannel>>();
    return {
        mockRegistry: registry,
        mockSupabase: {
            channel(topic: string) {
                const existing = registry.get(topic);
                if (existing) return existing;
                const channel = new FakeChannel(topic);
                registry.set(topic, channel);
                return channel;
            },
            removeChannel: (channel: InstanceType<typeof FakeChannel>) => {
                registry.delete(channel.topic);
            },
        },
    };
});

vi.mock('../lib/supabase', () => ({ supabase: mockSupabase, isSupabaseConfigured: true }));

const { souscrirePartage, _reinitialiserRegistre } = await import('./realtimeShared');

/**
 * Branche un `.on` minimal et relaie la charge utile telle quelle. Le faux
 * channel émet une simple chaîne, ce qui suffit à observer le routage.
 */
const brancher = (channel: RealtimeChannel, emettre: (e: string) => void) =>
    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'peu_importe' },
        (payload) => emettre(String(payload)),
    );

afterEach(() => {
    _reinitialiserRegistre();
    mockRegistry.clear();
});

describe('souscrirePartage', () => {
    it("un second abonné sur le même topic ne rebranche pas le channel (le crash d'origine)", () => {
        expect(() => souscrirePartage('t:ws1', brancher, vi.fn())).not.toThrow();
        expect(() => souscrirePartage('t:ws1', brancher, vi.fn())).not.toThrow();
        expect(mockRegistry.size).toBe(1);
    });

    it("un remontage rapide ne rebranche pas un channel encore ouvert", () => {
        // `removeChannel` est asynchrone en vrai : si le cleanup n'a pas encore
        // été appelé au moment du remontage, `channel(topic)` rend l'instance
        // déjà souscrite — et un `.on()` de plus ferait tomber la SPA.
        const off = souscrirePartage('t:ws1', brancher, vi.fn());
        expect(() => souscrirePartage('t:ws1', brancher, vi.fn())).not.toThrow();
        off();
        expect(mockRegistry.has('t:ws1')).toBe(true); // le second tient encore le channel
    });

    it('diffuse à tous les abonnés du topic', () => {
        const a = vi.fn();
        const b = vi.fn();
        souscrirePartage('t:ws1', brancher, a);
        souscrirePartage('t:ws1', brancher, b);

        mockRegistry.get('t:ws1')!.emit('evt');
        expect(a).toHaveBeenCalledWith('evt');
        expect(b).toHaveBeenCalledWith('evt');
    });

    it('isole les topics : aucun événement ne traverse', () => {
        const ws1 = vi.fn();
        const ws2 = vi.fn();
        souscrirePartage('t:ws1', brancher, ws1);
        souscrirePartage('t:ws2', brancher, ws2);

        mockRegistry.get('t:ws2')!.emit('evt-ws2');
        expect(ws2).toHaveBeenCalledTimes(1);
        expect(ws1).not.toHaveBeenCalled();
    });

    it('ferme le channel au départ du dernier abonné seulement', () => {
        const offA = souscrirePartage('t:ws1', brancher, vi.fn());
        const offB = souscrirePartage('t:ws1', brancher, vi.fn());

        offA();
        expect(mockRegistry.has('t:ws1')).toBe(true);
        offB();
        expect(mockRegistry.has('t:ws1')).toBe(false);
    });

    it('un abonné qui lève ne prive pas les autres et ne fait pas remonter', () => {
        const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
        souscrirePartage('t:ws1', brancher, () => {
            throw new Error('boum');
        });
        const sain = vi.fn();
        souscrirePartage('t:ws1', brancher, sain);

        expect(() => mockRegistry.get('t:ws1')!.emit('evt')).not.toThrow();
        expect(sain).toHaveBeenCalledWith('evt');
        expect(erreurs).toHaveBeenCalled();
        erreurs.mockRestore();
    });

    describe('statut du canal', () => {
        it('annonce le statut à tous les abonnés présents', () => {
            const statutA = vi.fn();
            const statutB = vi.fn();
            souscrirePartage('t:ws1', brancher, vi.fn(), statutA);
            souscrirePartage('t:ws1', brancher, vi.fn(), statutB);

            mockRegistry.get('t:ws1')!.annoncer('SUBSCRIBED');
            expect(statutA).toHaveBeenLastCalledWith(true);
            expect(statutB).toHaveBeenLastCalledWith(true);
        });

        it("rejoue le statut connu à un abonné arrivé après la connexion", () => {
            // Sans ce rejeu, le badge « Live » d'un composant monté plus tard
            // resterait éteint alors que le canal est bien connecté — le
            // callback de statut, lui, n'est appelé qu'une fois.
            souscrirePartage('t:ws1', brancher, vi.fn());
            mockRegistry.get('t:ws1')!.annoncer('SUBSCRIBED');

            const tardif = vi.fn();
            souscrirePartage('t:ws1', brancher, vi.fn(), tardif);
            expect(tardif).toHaveBeenCalledWith(true);
        });
    });
});
