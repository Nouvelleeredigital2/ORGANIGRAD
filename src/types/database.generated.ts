// Types générés le 2026-10-25 par `generate_typescript_types` (MCP Supabase) sur la base
// xucmfdggetwxmpquqjvj, après les migrations du Lot 1 (audit du 22/10).
// NE PAS ÉDITER À LA MAIN : régénérer, puis relire le diff. `src/types/supabase.ts` reste
// le contrat applicatif écrit à la main ; `src/types/supabase.contract.test.ts` vérifie
// qu'il ne nomme aucune table ni colonne absente d'ici.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          created_at: string
          id: number
          ip: string | null
          metadata: Json | null
          request_id: string | null
          resource_id: string | null
          resource_type: string
          result: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind: string
          created_at?: string
          id?: never
          ip?: string | null
          metadata?: Json | null
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          result: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          id?: never
          ip?: string | null
          metadata?: Json | null
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          result?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_activation_receipts: {
        Row: {
          action: string
          actor_id: string
          bot_id: string
          compiled_sha256: string
          created_at: string
          id: string
          reason: string | null
          verification: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id: string
          bot_id: string
          compiled_sha256: string
          created_at?: string
          id?: string
          reason?: string | null
          verification?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          bot_id?: string
          compiled_sha256?: string
          created_at?: string
          id?: string
          reason?: string | null
          verification?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_activation_receipts_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bot_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_profiles: {
        Row: {
          avatar_url: string | null
          brand: string | null
          compiled_prompt: string
          compiled_sha256: string
          created_at: string
          deliverables: string
          display_name: string
          enabled: boolean
          family: string
          file_name: string
          id: string
          limits: string
          method: string
          mission: string
          model: Json
          network: string | null
          personality: string
          research: string
          runtime_id: string
          sources: Json
          telegram_username: string | null
          updated_at: string
          useful_context: string
          watch: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          brand?: string | null
          compiled_prompt?: string
          compiled_sha256?: string
          created_at?: string
          deliverables?: string
          display_name: string
          enabled?: boolean
          family: string
          file_name: string
          id: string
          limits?: string
          method?: string
          mission?: string
          model?: Json
          network?: string | null
          personality?: string
          research?: string
          runtime_id: string
          sources?: Json
          telegram_username?: string | null
          updated_at?: string
          useful_context?: string
          watch?: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          brand?: string | null
          compiled_prompt?: string
          compiled_sha256?: string
          created_at?: string
          deliverables?: string
          display_name?: string
          enabled?: boolean
          family?: string
          file_name?: string
          id?: string
          limits?: string
          method?: string
          mission?: string
          model?: Json
          network?: string | null
          personality?: string
          research?: string
          runtime_id?: string
          sources?: Json
          telegram_username?: string | null
          updated_at?: string
          useful_context?: string
          watch?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_execution_receipts: {
        Row: {
          accepted_at: string | null
          id: string
          idempotency_key: string
          mandate_id: string | null
          payload_sha256: string
          project: Json
          reference: Json | null
          reserved_at: string
          run_id: string
          run_version: number
          status: string
          step_id: string
          superseded_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          idempotency_key: string
          mandate_id?: string | null
          payload_sha256: string
          project: Json
          reference?: Json | null
          reserved_at?: string
          run_id: string
          run_version: number
          status?: string
          step_id: string
          superseded_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          idempotency_key?: string
          mandate_id?: string | null
          payload_sha256?: string
          project?: Json
          reference?: Json | null
          reserved_at?: string
          run_id?: string
          run_version?: number
          status?: string
          step_id?: string
          superseded_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_execution_receipts_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "project_service_delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_execution_receipts_run_id_workspace_id_fkey"
            columns: ["run_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "circuit_executions"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "circuit_execution_receipts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "circuit_execution_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_executions: {
        Row: {
          circuit_id: string
          created_by: string
          id: string
          idempotency_key: string
          state: Json
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          circuit_id: string
          created_by: string
          id: string
          idempotency_key: string
          state: Json
          updated_at?: string
          version: number
          workspace_id: string
        }
        Update: {
          circuit_id?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          state?: Json
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_executions_circuit_id_workspace_id_fkey"
            columns: ["circuit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "team_circuits"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      circuit_schedule_cursors: {
        Row: {
          circuit_id: string
          grant_id: string
          next_due_at: string
          workspace_id: string
        }
        Insert: {
          circuit_id: string
          grant_id: string
          next_due_at: string
          workspace_id: string
        }
        Update: {
          circuit_id?: string
          grant_id?: string
          next_due_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_schedule_cursors_circuit_id_workspace_id_fkey"
            columns: ["circuit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "team_circuits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "circuit_schedule_cursors_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "circuit_service_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_schedule_occurrences: {
        Row: {
          circuit_id: string
          definition: Json
          definition_version: number
          grant_id: string
          id: string
          recorded_at: string
          run_id: string | null
          scheduled_for: string
          status: string
          workspace_id: string
        }
        Insert: {
          circuit_id: string
          definition: Json
          definition_version: number
          grant_id: string
          id: string
          recorded_at: string
          run_id?: string | null
          scheduled_for: string
          status: string
          workspace_id: string
        }
        Update: {
          circuit_id?: string
          definition?: Json
          definition_version?: number
          grant_id?: string
          id?: string
          recorded_at?: string
          run_id?: string | null
          scheduled_for?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_schedule_occurrences_circuit_id_workspace_id_fkey"
            columns: ["circuit_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "team_circuits"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "circuit_schedule_occurrences_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "circuit_service_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_schedule_occurrences_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "circuit_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_service_grants: {
        Row: {
          action: string
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          project_id: string
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          expires_at: string
          granted_by: string
          id: string
          project_id: string
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          expires_at?: string
          granted_by?: string
          id?: string
          project_id?: string
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_service_grants_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      circuit_step_attempts: {
        Row: {
          dispatched_at: string | null
          fencing_token: string
          job_id: string | null
          lease_until: string
          payload_sha256: string
          run_id: string
          run_version: number
          status: string
          step_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          dispatched_at?: string | null
          fencing_token: string
          job_id?: string | null
          lease_until: string
          payload_sha256: string
          run_id: string
          run_version: number
          status: string
          step_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          dispatched_at?: string | null
          fencing_token?: string
          job_id?: string | null
          lease_until?: string
          payload_sha256?: string
          run_id?: string
          run_version?: number
          status?: string
          step_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_step_attempts_run_id_workspace_id_fkey"
            columns: ["run_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "circuit_executions"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      hybrid_nodes: {
        Row: {
          avatar_url: string | null
          cadence: string | null
          created_at: string
          external_app: string | null
          grade_id: string
          id: string
          mcp_config: Json | null
          nom: string
          notification_channels: Json | null
          parent_id: string | null
          presence: string | null
          presence_observed_at: string | null
          role_titre: string
          skills: string[]
          status: string
          system_prompt: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          cadence?: string | null
          created_at?: string
          external_app?: string | null
          grade_id?: string
          id?: string
          mcp_config?: Json | null
          nom: string
          notification_channels?: Json | null
          parent_id?: string | null
          presence?: string | null
          presence_observed_at?: string | null
          role_titre: string
          skills?: string[]
          status?: string
          system_prompt?: string | null
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          cadence?: string | null
          created_at?: string
          external_app?: string | null
          grade_id?: string
          id?: string
          mcp_config?: Json | null
          nom?: string
          notification_channels?: Json | null
          parent_id?: string | null
          presence?: string | null
          presence_observed_at?: string | null
          role_titre?: string
          skills?: string[]
          status?: string
          system_prompt?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hybrid_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "hybrid_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hybrid_nodes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      node_transitions: {
        Row: {
          actor_id: string | null
          actor_kind: string
          created_at: string
          from_status: string
          id: string
          node_id: string
          payload: Json | null
          to_status: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          created_at?: string
          from_status: string
          id?: string
          node_id: string
          payload?: Json | null
          to_status: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          from_status?: string
          id?: string
          node_id?: string
          payload?: Json | null
          to_status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_transitions_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "hybrid_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "node_transitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          message: string
          node_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          target: string
          workspace_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          message: string
          node_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          target: string
          workspace_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          message?: string
          node_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          target?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "hybrid_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_agents: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          email: string | null
          external_key: string
          fonction: string
          grade_style: string
          id: string
          nbi: string | null
          nom: string
          phone: string | null
          pole: string
          prenom: string
          rattachement_id: string | null
          service: string
          source_kind: string
          source_ref: string
          titre: string
          type_temps: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_key: string
          fonction?: string
          grade_style?: string
          id?: string
          nbi?: string | null
          nom?: string
          phone?: string | null
          pole?: string
          prenom?: string
          rattachement_id?: string | null
          service?: string
          source_kind?: string
          source_ref?: string
          titre?: string
          type_temps?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          external_key?: string
          fonction?: string
          grade_style?: string
          id?: string
          nbi?: string | null
          nom?: string
          phone?: string | null
          pole?: string
          prenom?: string
          rattachement_id?: string | null
          service?: string
          source_kind?: string
          source_ref?: string
          titre?: string
          type_temps?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_agents_rattachement_id_fkey"
            columns: ["rattachement_id"]
            isOneToOne: false
            referencedRelation: "org_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_project_tokens: {
        Row: {
          created_at: string
          expires_at: number
          id: string
          issuer_expires_at: number
          name: string
          owner_id: string
          project_id: string
          revoked_at: string | null
          scopes: string[]
          session_id: string
          token_hash: string
          token_prefix: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at: number
          id?: string
          issuer_expires_at: number
          name: string
          owner_id: string
          project_id: string
          revoked_at?: string | null
          scopes?: string[]
          session_id: string
          token_hash: string
          token_prefix: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: number
          id?: string
          issuer_expires_at?: number
          name?: string
          owner_id?: string
          project_id?: string
          revoked_at?: string | null
          scopes?: string[]
          session_id?: string
          token_hash?: string
          token_prefix?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_project_tokens_workspace_id_project_id_fkey"
            columns: ["workspace_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      project_service_delegation_audit: {
        Row: {
          actor_id: string
          detail: Json
          grant_id: string
          id: number
          kind: string
          recorded_at: string
        }
        Insert: {
          actor_id: string
          detail?: Json
          grant_id: string
          id?: never
          kind: string
          recorded_at?: string
        }
        Update: {
          actor_id?: string
          detail?: Json
          grant_id?: string
          id?: never
          kind?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_service_delegation_audit_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "project_service_delegations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_service_delegations: {
        Row: {
          actions: string[]
          api_key_id: string
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          node_id: string
          project_id: string
          revoked_at: string | null
          target: Json
          version: number
          workspace_id: string
        }
        Insert: {
          actions: string[]
          api_key_id: string
          created_at?: string
          expires_at: string
          granted_by: string
          id: string
          node_id: string
          project_id: string
          revoked_at?: string | null
          target: Json
          version?: number
          workspace_id: string
        }
        Update: {
          actions?: string[]
          api_key_id?: string
          created_at?: string
          expires_at?: string
          granted_by?: string
          id?: string
          node_id?: string
          project_id?: string
          revoked_at?: string | null
          target?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_service_delegations_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "workspace_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_delegations_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "hybrid_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_delegations_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          created_at: string
          description: string
          due_date: string | null
          id: string
          project_id: string
          status: string
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_workspace_id_project_id_fkey"
            columns: ["workspace_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string
          id: string
          name: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id?: string
          name: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      synapse_project_grants: {
        Row: {
          created_at: string
          membership_created: boolean
          project_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          membership_created: boolean
          project_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          membership_created?: boolean
          project_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "synapse_project_grants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "synapse_project_links"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "synapse_project_grants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      synapse_project_links: {
        Row: {
          created_at: string
          created_by: string
          idempotency_key: string
          project_id: string
          synapse_workspace_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          idempotency_key: string
          project_id: string
          synapse_workspace_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          idempotency_key?: string
          project_id?: string
          synapse_workspace_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "synapse_project_links_workspace_id_project_id_fkey"
            columns: ["workspace_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      team_circuits: {
        Row: {
          created_by: string
          definition: Json
          enabled: boolean
          id: string
          project_id: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_by: string
          definition: Json
          enabled?: boolean
          id: string
          project_id: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_by?: string
          definition?: Json
          enabled?: boolean
          id?: string
          project_id?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_circuits_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "team_circuits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      workspace_members_view: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          role: Database["public"]["Enums"]["workspace_role"] | null
          user_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_token: string }
        Returns: {
          role: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
        }[]
      }
      activate_verified_bot: { Args: { p_bot_id: string }; Returns: Json }
      bot_activation_status: { Args: { p_bot_id: string }; Returns: Json }
      can_access_project: {
        Args: {
          target_project_id: string
          target_workspace_id: string
          write_access?: boolean
        }
        Returns: boolean
      }
      circuit_receipt_accept: {
        Args: { p_receipt: string; p_reference: Json }
        Returns: Json
      }
      circuit_receipt_mark_uncertain: {
        Args: { p_receipt: string }
        Returns: Json
      }
      circuit_receipt_reserve: {
        Args: {
          p_idempotency_key: string
          p_mandate: string
          p_payload_sha256: string
          p_project: Json
          p_run: string
          p_run_version: number
          p_step: string
          p_workspace: string
        }
        Returns: Json
      }
      circuit_receipt_supersede: {
        Args: { p_receipt: string; p_successor: string }
        Returns: Json
      }
      create_scoped_workspace_api_key: {
        Args: { p_name: string; p_scopes: string[]; p_workspace_id: string }
        Returns: {
          created_at: string
          id: string
          key_prefix: string
          raw_key: string
        }[]
      }
      create_workspace_api_key: {
        Args: { p_name: string; p_workspace_id: string }
        Returns: {
          created_at: string
          id: string
          key_prefix: string
          raw_key: string
        }[]
      }
      deactivate_bot: {
        Args: { p_bot_id: string; p_reason: string }
        Returns: Json
      }
      has_workspace_role: {
        Args: { p_roles: string[]; p_ws: string }
        Returns: boolean
      }
      import_org_agents: {
        Args: {
          p_agents: Json
          p_expected_updated_at?: string
          p_mode?: string
          p_source_kind: string
          p_source_ref: string
          p_workspace_id: string
        }
        Returns: {
          deleted: number
          inserted: number
          updated: number
        }[]
      }
      invite_workspace_member: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["workspace_role"]
          p_workspace_id: string
        }
        Returns: {
          expires_at: string
          id: string
          token: string
        }[]
      }
      is_workspace_member: { Args: { ws: string }; Returns: boolean }
      list_project_service_missions: {
        Args: {
          p_after_grant?: string
          p_after_run?: string
          p_app: string
          p_key: string
          p_limit?: number
          p_native_workspace: string
          p_resource: string
          p_workspace: string
        }
        Returns: Json
      }
      list_project_service_targets:
        | {
            Args: {
              p_after?: string
              p_app: string
              p_key: string
              p_limit?: number
              p_native_workspace: string
              p_workspace: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_action: string
              p_after: string
              p_app: string
              p_key: string
              p_limit: number
              p_native_workspace: string
              p_resource: string
              p_workspace: string
            }
            Returns: Json
          }
      project_service_delegation_command: {
        Args: {
          p_command: string
          p_input: Json
          p_key: string
          p_project: string
          p_user: string
          p_workspace: string
        }
        Returns: Json
      }
      release_stale_notification_reservations: {
        Args: { p_older_than?: string }
        Returns: number
      }
      verify_workspace_api_key: { Args: { raw_key: string }; Returns: string }
      workspace_role_of: {
        Args: { ws: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      workspace_role: "owner" | "admin" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
