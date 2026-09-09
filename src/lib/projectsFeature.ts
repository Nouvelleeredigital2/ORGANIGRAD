/** Both navigation and routing must opt in; an absent flag is disabled. */
export const isProjectsEnabled = (): boolean => import.meta.env.VITE_PROJECTS_ENABLED === 'true';
