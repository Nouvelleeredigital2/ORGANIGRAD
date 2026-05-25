import type { Agent } from '../types/agent';

export interface PoleDirectoryEntry {
    key: string;
    pole: string;
    count: number;
}

export const getPoleKey = (pole: string): string => pole;

export const buildPoleDirectory = (agents: Agent[]): PoleDirectoryEntry[] => {
    const counts = new Map<string, number>();

    agents.forEach((agent) => {
        const pole = agent.pole || 'Sans pole';
        counts.set(pole, (counts.get(pole) || 0) + 1);
    });

    return Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b, 'fr'))
        .map(([pole, count]) => ({
            key: getPoleKey(pole),
            pole,
            count,
        }));
};
