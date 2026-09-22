import { useEffect, useState } from 'react';
import { BaseModal } from './BaseModal';
import { ARCHETYPE } from '../design/tokens';
import type { HybridNode } from '../types/hybridNode';
import { transitionsRepo, type TransitionRecord } from '../services/transitionsRepo';

/**
 * Détail d'un nœud avant décision humaine.
 *
 * On approuvait jusqu'ici un livrable sans aucun moyen de le consulter : le
 * bouton « Détails » du Centre de validation n'était jamais rendu.
 *
 * `HybridNode` ne porte aucun champ « livrable ». Ce qui s'en approche le plus
 * est le `payload` de la dernière transition — c'est donc ce qu'on affiche, en
 * disant explicitement quand il n'y en a pas, plutôt que de laisser croire à un
 * contenu absent.
 */

interface NodeDetailsModalProps {
    node: HybridNode | null;
    workspaceId: string | null;
    onClose: () => void;
}

export function NodeDetailsModal({ node, workspaceId, onClose }: NodeDetailsModalProps) {
    // Le contenu n'est monté qu'avec un nœud : l'état interne repart donc de
    // zéro à chaque ouverture, sans setState conditionnel dans un effet.
    if (!node) return null;
    return <NodeDetailsContent node={node} workspaceId={workspaceId} onClose={onClose} />;
}

function NodeDetailsContent({
    node,
    workspaceId,
    onClose,
}: {
    node: HybridNode;
    workspaceId: string | null;
    onClose: () => void;
}) {
    const [transition, setTransition] = useState<TransitionRecord | null>(null);
    // Mode local : les transitions ne sont pas persistées, il n'y a rien à lire.
    const [etat, setEtat] = useState<'chargement' | 'pret' | 'indisponible'>(() =>
        workspaceId ? 'chargement' : 'indisponible',
    );

    // Changement de nœud sans démontage : ajustement PENDANT le rendu.
    const [syncedId, setSyncedId] = useState(node.id);
    if (syncedId !== node.id) {
        setSyncedId(node.id);
        setTransition(null);
        setEtat(workspaceId ? 'chargement' : 'indisponible');
    }

    useEffect(() => {
        if (!workspaceId) return;
        let annule = false;
        void transitionsRepo.listRecent(workspaceId, 50).then(({ rows, error }) => {
            if (annule) return;
            if (error) {
                setEtat('indisponible');
                return;
            }
            setTransition(rows.find((r) => r.nodeId === node.id) ?? null);
            setEtat('pret');
        });
        return () => {
            annule = true;
        };
    }, [node.id, workspaceId]);

    const archetype = ARCHETYPE[node.type];

    return (
        <BaseModal isOpen onClose={onClose} title={`Détail · ${node.nom}`}>
            <div className="space-y-5">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                        {archetype.label}
                    </p>
                    <p className="text-sm font-bold text-slate-900">{node.nom}</p>
                    <p className="text-xs text-slate-500">{node.roleTitre}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Statut
                        </p>
                        <p className="text-sm font-bold text-slate-900">{node.status}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Dernière transition
                        </p>
                        <p className="text-sm font-bold text-slate-900">
                            {transition
                                ? `${transition.from} → ${transition.to}`
                                : etat === 'pret'
                                  ? 'aucune'
                                  : '—'}
                        </p>
                        {transition && (
                            <p className="mt-1 text-[11px] text-slate-500">
                                {new Date(transition.timestamp).toLocaleString('fr-FR')}
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-400">
                        Livrable
                    </p>
                    {etat === 'chargement' && (
                        <p className="text-xs text-slate-500">Chargement…</p>
                    )}
                    {etat === 'indisponible' && (
                        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                            Historique indisponible — les transitions ne sont conservées que
                            lorsqu'un workspace est branché.
                        </p>
                    )}
                    {etat === 'pret' &&
                        (transition?.payload ? (
                            <pre className="max-h-48 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                                {JSON.stringify(transition.payload, null, 2)}
                            </pre>
                        ) : (
                            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                                Aucun livrable joint à la dernière transition. La décision porte sur
                                le passage d'état lui-même.
                            </p>
                        ))}
                </div>
            </div>
        </BaseModal>
    );
}
