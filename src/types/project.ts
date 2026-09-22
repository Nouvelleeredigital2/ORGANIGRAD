export type ProjectTaskStatus = 'todo' | 'running' | 'blocked' | 'done';

export type Project = {
    id: string;
    workspace_id: string;
    name: string;
    description: string;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
    version: number;
};

export type ProjectTask = {
    id: string;
    workspace_id: string;
    project_id: string;
    title: string;
    description: string;
    status: ProjectTaskStatus;
    assignee_id: string | null;
    due_date: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
    version: number;
};

export type ProjectChanges = Partial<Pick<Project, 'name' | 'description' | 'archived_at'>>;
export type TaskChanges = Partial<Pick<ProjectTask, 'title' | 'description' | 'status' | 'assignee_id' | 'due_date' | 'archived_at'>>;
export type NewProject = Pick<Project, 'id' | 'name'> & Partial<Pick<Project, 'description'>>;
export type NewTask = Pick<ProjectTask, 'id' | 'title'> & Partial<Pick<ProjectTask, 'description' | 'status' | 'assignee_id' | 'due_date'>>;
export interface ProjectMember { id: string; label: string }
