import type { Agent } from './agent';

export interface TreeNode extends Agent {
    children?: TreeNode[];
    totalAgentsInBranch?: number;
}
