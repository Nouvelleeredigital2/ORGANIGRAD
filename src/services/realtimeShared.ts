import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Channels Realtime partagés, un par topic.
 *
 * `supabase.channel(topic)` renvoie l'instance EXISTANTE pour un topic déjà
 * enregistré, pas une nouvelle. Un second `.on('postgres_changes', …)` sur un
 * channel déjà `.subscribe()` lève une exception non rattrapable — depuis le
 * cœur de supabase-js, hors de toute frontière React : c'est toute la SPA qui
 * tombe (page blanche, constaté en recette connectée le 2026-08-11 en ouvrant
 * Orchestration alors que le Journal d'activité était monté).
 *
 * Deux façons d'y retomber, pas une seule :
 *
 *  1. deux composants qui s'abonnent au même topic (le cas constaté) ;
 *  2. un seul composant démonté puis remonté rapidement — `removeChannel` est
 *     asynchrone, et le nouveau `channel(topic)` peut encore recevoir
 *     l'ancienne instance, déjà souscrite. React StrictMode et un effet rejoué
 *     suffisent à le déclencher.
 *
 * D'où ce registre : un seul channel par topic, un dispatcher en aval, et un
 * comptage de références pour ne fermer qu'au départ du dernier abonné.
 */

/**
 * Un abonnement est encapsulé dans un objet propre plutôt qu'indexé par
 * identité de fonction : deux composants passant LA MÊME fonction (callback
 * stable, handler défini au niveau module) ne compteraient que pour un seul
 * dans un `Set`, et le premier désabonnement fermerait le channel sous les
 * pieds du second. Le comptage porte sur les abonnements, pas sur les fonctions.
 */
interface Abonne<E> {
    ecouteur: (evenement: E) => void;
    onStatus?: (abonne: boolean) => void;
}

interface Entree {
    channel: RealtimeChannel;
    abonnes: Set<Abonne<never>>;
    /** Dernier statut connu du canal, rejoué aux abonnés qui arrivent après. */
    statut: boolean;
}

const registre = new Map<string, Entree>();

/** Isole chaque abonné : celui qui lève ne prive pas les suivants. */
function diffuser<T>(abonnes: Iterable<Abonne<never>>, topic: string, appliquer: (a: Abonne<T>) => void) {
    for (const abonne of abonnes) {
        try {
            appliquer(abonne as unknown as Abonne<T>);
        } catch (err) {
            // Sans ce garde-fou l'exception remonterait dans le callback
            // Realtime de supabase-js — donc en erreur non gérée — et
            // interromprait la boucle, privant les abonnés suivants.
            console.error(`[realtime] un abonné a levé sur « ${topic} »`, err);
        }
    }
}

/**
 * S'abonne à un topic Realtime partagé.
 *
 * @param topic    identifiant du canal — DOIT porter le workspace pour que deux
 *                 workspaces ne partagent jamais un channel ni ses événements.
 * @param brancher pose le(s) `.on(...)` sur le channel neuf. Appelé UNE SEULE
 *                 FOIS par topic, à la création — jamais sur un channel déjà
 *                 souscrit, ce qui est précisément ce qui faisait tomber la SPA.
 * @returns fonction de nettoyage, idempotente.
 */
export function souscrirePartage<E>(
    topic: string,
    brancher: (channel: RealtimeChannel, emettre: (evenement: E) => void) => RealtimeChannel,
    ecouteur: (evenement: E) => void,
    onStatus?: (abonne: boolean) => void,
): () => void {
    if (!supabase) {
        onStatus?.(false);
        return () => {};
    }

    let entree = registre.get(topic);
    if (!entree) {
        const abonnes = new Set<Abonne<never>>();
        const nouvelle: Entree = {
            abonnes,
            statut: false,
            channel: brancher(supabase.channel(topic), (evenement: E) =>
                diffuser<E>(abonnes, topic, (a) => a.ecouteur(evenement)),
            ).subscribe((status) => {
                const abonne = status === 'SUBSCRIBED';
                const courante = registre.get(topic);
                if (courante) courante.statut = abonne;
                diffuser<E>(abonnes, topic, (a) => a.onStatus?.(abonne));
            }),
        };
        entree = nouvelle;
        registre.set(topic, nouvelle);
    } else {
        // Arrivé après coup : sans ce rappel, un abonné tardif n'apprendrait
        // jamais que le canal est déjà connecté (badge « Live » figé sur off).
        onStatus?.(entree.statut);
    }

    const abonnement: Abonne<E> = { ecouteur, onStatus };
    entree.abonnes.add(abonnement as unknown as Abonne<never>);

    return () => {
        const courante = registre.get(topic);
        // `delete` renvoie false si l'abonnement est déjà retiré : un cleanup
        // appelé deux fois ne doit pas fermer le channel d'un autre abonné.
        if (!courante || !courante.abonnes.delete(abonnement as unknown as Abonne<never>)) return;
        if (courante.abonnes.size === 0) {
            registre.delete(topic);
            void supabase?.removeChannel(courante.channel);
        }
    };
}

/** Réservé aux tests : vide le registre entre deux cas. */
export function _reinitialiserRegistre(): void {
    registre.clear();
}
