/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PROJECTS_ENABLED?: string;
    readonly VITE_PRIVATE_PROJECTS_ENABLED?: string;
    readonly VITE_ORCHESTRATOR_URL?: string;
}
