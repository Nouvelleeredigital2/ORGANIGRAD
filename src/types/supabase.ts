/**
 * Types générés depuis le schéma Supabase via `generate_typescript_types`.
 * À régénérer après chaque migration.
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ActorKind = 'user' | 'api_key' | 'orchestrator';

export type Database = {
    __InternalSupabase: { PostgrestVersion: '14.5' };
    public: {
        Tables: {
            hybrid_nodes: {
                Row: {
                    avatar_url: string | null;
                    created_at: string;
                    grade_id: string;
                    id: string;
                    mcp_config: Json | null;
                    nom: string;
                    notification_channels: Json | null;
                    parent_id: string | null;
                    role_titre: string;
                    skills: string[];
                    status: string;
                    system_prompt: string | null;
                    type: string;
                    updated_at: string;
                    workspace_id: string;
                };
                Insert: {
                    avatar_url?: string | null;
                    created_at?: string;
                    grade_id?: string;
                    id?: string;
                    mcp_config?: Json | null;
                    nom: string;
                    notification_channels?: Json | null;
                    parent_id?: string | null;
                    role_titre: string;
                    skills?: string[];
                    status?: string;
                    system_prompt?: string | null;
                    type: string;
                    updated_at?: string;
                    workspace_id: string;
                };
                Update: Partial<Database['public']['Tables']['hybrid_nodes']['Insert']>;
                Relationships: [];
            };
            profiles: {
                Row: {
                    created_at: string;
                    display_name: string | null;
                    email: string;
                    id: string;
                };
                Insert: {
                    created_at?: string;
                    display_name?: string | null;
                    email: string;
                    id: string;
                };
                Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
                Relationships: [];
            };
            workspace_members: {
                Row: {
                    created_at: string;
                    role: WorkspaceRole;
                    user_id: string;
                    workspace_id: string;
                };
                Insert: {
                    created_at?: string;
                    role?: WorkspaceRole;
                    user_id: string;
                    workspace_id: string;
                };
                Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
                Relationships: [];
            };
            workspaces: {
                Row: {
                    created_at: string;
                    id: string;
                    name: string;
                    owner_id: string;
                    slug: string;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    name: string;
                    owner_id: string;
                    slug: string;
                    updated_at?: string;
                };
                Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
                Relationships: [];
            };
            workspace_api_keys: {
                Row: {
                    created_at: string;
                    created_by: string | null;
                    id: string;
                    key_hash: string;
                    key_prefix: string;
                    last_used_at: string | null;
                    name: string;
                    revoked_at: string | null;
                    workspace_id: string;
                };
                Insert: {
                    created_at?: string;
                    created_by?: string | null;
                    id?: string;
                    key_hash: string;
                    key_prefix: string;
                    last_used_at?: string | null;
                    name: string;
                    revoked_at?: string | null;
                    workspace_id: string;
                };
                Update: Partial<Database['public']['Tables']['workspace_api_keys']['Insert']>;
                Relationships: [];
            };
            workspace_invitations: {
                Row: {
                    accepted_at: string | null;
                    accepted_by: string | null;
                    created_at: string;
                    created_by: string | null;
                    email: string;
                    expires_at: string;
                    id: string;
                    revoked_at: string | null;
                    role: WorkspaceRole;
                    token: string;
                    workspace_id: string;
                };
                Insert: {
                    accepted_at?: string | null;
                    accepted_by?: string | null;
                    created_at?: string;
                    created_by?: string | null;
                    email: string;
                    expires_at?: string;
                    id?: string;
                    revoked_at?: string | null;
                    role?: WorkspaceRole;
                    token: string;
                    workspace_id: string;
                };
                Update: Partial<Database['public']['Tables']['workspace_invitations']['Insert']>;
                Relationships: [];
            };
            node_transitions: {
                Row: {
                    actor_id: string | null;
                    actor_kind: ActorKind;
                    created_at: string;
                    from_status: string;
                    id: string;
                    node_id: string;
                    payload: Json | null;
                    to_status: string;
                    workspace_id: string;
                };
                Insert: {
                    actor_id?: string | null;
                    actor_kind: ActorKind;
                    created_at?: string;
                    from_status: string;
                    id?: string;
                    node_id: string;
                    payload?: Json | null;
                    to_status: string;
                    workspace_id: string;
                };
                Update: Partial<Database['public']['Tables']['node_transitions']['Insert']>;
                Relationships: [];
            };
            notifications: {
                Row: {
                    id: string;
                    workspace_id: string;
                    node_id: string | null;
                    channel: 'slack_webhook' | 'email' | 'whatsapp';
                    target: string;
                    subject: string | null;
                    message: string;
                    status: 'pending' | 'sent' | 'failed';
                    error: string | null;
                    created_at: string;
                    sent_at: string | null;
                };
                Insert: {
                    id?: string;
                    workspace_id: string;
                    node_id?: string | null;
                    channel: 'slack_webhook' | 'email' | 'whatsapp';
                    target: string;
                    subject?: string | null;
                    message: string;
                    status?: 'pending' | 'sent' | 'failed';
                    error?: string | null;
                    created_at?: string;
                    sent_at?: string | null;
                };
                Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
                Relationships: [];
            };
        };
        Views: {
            workspace_members_view: {
                Row: {
                    created_at: string | null;
                    display_name: string | null;
                    email: string | null;
                    role: WorkspaceRole | null;
                    user_id: string | null;
                    workspace_id: string | null;
                };
                Relationships: [];
            };
        };
        Functions: {
            create_workspace_api_key: {
                Args: { p_name: string; p_workspace_id: string };
                Returns: Array<{
                    id: string;
                    raw_key: string;
                    key_prefix: string;
                    created_at: string;
                }>;
            };
            invite_workspace_member: {
                Args: { p_workspace_id: string; p_email: string; p_role?: WorkspaceRole };
                Returns: Array<{ id: string; token: string; expires_at: string }>;
            };
            accept_workspace_invitation: {
                Args: { p_token: string };
                Returns: Array<{ workspace_id: string; role: WorkspaceRole }>;
            };
            is_workspace_member: { Args: { ws: string }; Returns: boolean };
            verify_workspace_api_key: { Args: { raw_key: string }; Returns: string | null };
            workspace_role_of: { Args: { ws: string }; Returns: WorkspaceRole };
        };
        Enums: { workspace_role: WorkspaceRole };
        CompositeTypes: Record<string, never>;
    };
};
