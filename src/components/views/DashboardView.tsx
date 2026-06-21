import React, { useMemo } from 'react';
import { Users, TrendingUp, Award, Box } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Agent } from '../../types/agent';

interface DashboardViewProps {
    rawAgents: Agent[];
    totalAgents: number;
    avgNbi: number;
    availablePoles: string[];
    loading: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ rawAgents, totalAgents, avgNbi, availablePoles, loading }) => {
    const { pieData, barData } = useMemo(() => {
        if (!rawAgents || rawAgents.length === 0) {
            return { pieData: [], barData: [] };
        }

        const complet = rawAgents.filter((agent) => agent.typeTemps === 'Complet').length;
        const nonComplet = rawAgents.filter((agent) => agent.typeTemps === 'Non complet').length;
        const computedPieData = [
            { name: 'Temps Complet', value: complet, color: '#0f172a' },
            { name: 'Temps Non Complet', value: nonComplet, color: '#0f766e' },
        ];

        const agentsPerPole: Record<string, number> = {};
        rawAgents.forEach((agent) => {
            if (agent.pole) {
                agentsPerPole[agent.pole] = (agentsPerPole[agent.pole] || 0) + 1;
            }
        });

        const computedBarData = Object.keys(agentsPerPole)
            .map((key) => ({
                pole: key,
                agents: agentsPerPole[key] ?? 0,
            }))
            .sort((a, b) => b.agents - a.agents)
            .slice(0, 5);

        return { pieData: computedPieData, barData: computedBarData };
    }, [rawAgents]);

    return (
        <div className="w-full h-full overflow-y-auto no-scrollbar p-4 pt-16 sm:p-6 lg:p-10 lg:pt-10 pb-32">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="mb-10">
                    <p className="eyebrow">Vue d'ensemble</p>
                    <h1 className="t-display mt-2" style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}>
                        Tableau de bord.
                    </h1>
                    <p className="t-body mt-2">L'effectif d'aujourd'hui, sans détour.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                        <div className="w-14 h-14 bg-slate-900 rounded-[1.45rem] flex items-center justify-center text-white mb-6 shadow-[0_14px_34px_rgba(15,23,42,0.18)]">
                            <Users className="w-6 h-6" />
                        </div>
                        <p className="text-slate-500 font-bold uppercase tracking-[0.18em] text-xs mb-1">Effectif Total</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black tracking-tighter text-slate-900">{loading ? '-' : totalAgents}</span>
                            <span className="text-slate-400 font-bold">agents</span>
                        </div>
                    </div>

                    <div className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                        <div className="w-14 h-14 bg-sky-700 rounded-[1.45rem] flex items-center justify-center text-white mb-6 shadow-[0_14px_34px_rgba(14,116,144,0.18)]">
                            <Award className="w-6 h-6" />
                        </div>
                        <p className="text-slate-500 font-bold uppercase tracking-[0.18em] text-xs mb-1">Moyenne NBI</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black tracking-tighter text-slate-900">{loading ? '-' : avgNbi}</span>
                            <span className="text-slate-400 font-bold">pts</span>
                        </div>
                    </div>

                    <div className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                        <div className="w-14 h-14 bg-slate-600 rounded-[1.45rem] flex items-center justify-center text-white mb-6 shadow-[0_14px_34px_rgba(71,85,105,0.18)]">
                            <Box className="w-6 h-6" />
                        </div>
                        <p className="text-slate-500 font-bold uppercase tracking-[0.18em] text-xs mb-1">Pôles Actifs</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black tracking-tighter text-slate-900">{loading ? '-' : availablePoles.length}</span>
                            <span className="text-slate-400 font-bold">directions</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <div className="bg-white/82 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.12)]">
                        <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                            <Award className="w-5 h-5 text-slate-400" /> Répartition des Temps
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height={256}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 12px 30px rgba(148,163,184,0.18)' }} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white/82 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.12)]">
                        <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-slate-400" /> Top Pôles (Effectifs)
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height={256}>
                                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="pole"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        tickFormatter={(value) => (value.length > 10 ? `${value.substring(0, 10)}...` : value)}
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 12px 30px rgba(148,163,184,0.18)' }}
                                    />
                                    <Bar dataKey="agents" fill="#0f172a" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
