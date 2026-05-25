import Papa from 'papaparse';
import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';

const flattenTree = (viewTree: TreeNode[]): Agent[] => {
    const allAgents: Agent[] = [];

    const flatten = (nodes: TreeNode[]) => {
        nodes.forEach((node) => {
            const { children, totalAgentsInBranch, ...agentData } = node;
            void totalAgentsInBranch;
            allAgents.push(agentData as Agent);
            if (children) flatten(children);
        });
    };

    flatten(viewTree);
    return allAgents;
};

export const exportToCsv = (data: TreeNode[] | Agent[]) => {
    const allAgents = data.length > 0 && 'children' in data[0] ? flattenTree(data as TreeNode[]) : (data as Agent[]);
    const csv = Papa.unparse(allAgents);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Organigramme-Export-${new Date().toLocaleDateString('fr-FR')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
