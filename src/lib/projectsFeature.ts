/** Both navigation and routing must opt in; an absent flag is disabled. */
export const isProjectsEnabled = (): boolean => import.meta.env.VITE_PROJECTS_ENABLED === 'true';

/** Personal token management is a separate, explicit opt-in. */
export const isPrivateProjectsEnabled = (): boolean => isProjectsEnabled() && import.meta.env.VITE_PRIVATE_PROJECTS_ENABLED === 'true';
