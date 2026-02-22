export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      guardians: {
        Row: {
          id: string;
          name: string;
          email: string;
          last_active_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          last_active_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          last_active_at?: string;
          created_at?: string;
        };
      };
      children: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth: string;
          created_by_guardian_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          date_of_birth: string;
          created_by_guardian_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          date_of_birth?: string;
          created_by_guardian_id?: string | null;
          created_at?: string;
        };
      };
      guardian_children: {
        Row: {
          guardian_id: string;
          child_id: string;
        };
        Insert: {
          guardian_id: string;
          child_id: string;
        };
        Update: {
          guardian_id?: string;
          child_id?: string;
        };
      };
      co_guardian_visibility: {
        Row: {
          child_id: string;
          from_guardian_id: string;
          to_guardian_id: string;
          can_see_checkins: boolean;
        };
        Insert: {
          child_id: string;
          from_guardian_id: string;
          to_guardian_id: string;
          can_see_checkins?: boolean;
        };
        Update: {
          child_id?: string;
          from_guardian_id?: string;
          to_guardian_id?: string;
          can_see_checkins?: boolean;
        };
      };
      groups: {
        Row: {
          id: string;
          name: string;
          invite_token: string;
          is_public: boolean;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_token?: string;
          is_public?: boolean;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_token?: string;
          is_public?: boolean;
          expires_at?: string | null;
          created_at?: string;
        };
      };
      group_admins: {
        Row: {
          group_id: string;
          guardian_id: string;
        };
        Insert: {
          group_id: string;
          guardian_id: string;
        };
        Update: {
          group_id?: string;
          guardian_id?: string;
        };
      };
      guardian_child_groups: {
        Row: {
          guardian_id: string;
          child_id: string;
          group_id: string;
        };
        Insert: {
          guardian_id: string;
          child_id: string;
          group_id: string;
        };
        Update: {
          guardian_id?: string;
          child_id?: string;
          group_id?: string;
        };
      };
      guardian_group_settings: {
        Row: {
          guardian_id: string;
          group_id: string;
          notification_threshold: number | null;
          muted_at: string | null;
        };
        Insert: {
          guardian_id: string;
          group_id: string;
          notification_threshold?: number | null;
          muted_at?: string | null;
        };
        Update: {
          guardian_id?: string;
          group_id?: string;
          notification_threshold?: number | null;
          muted_at?: string | null;
        };
      };
      playgrounds: {
        Row: {
          id: string;
          name: string;
          normalized_name: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          normalized_name: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          normalized_name?: string;
          created_by?: string | null;
          created_at?: string;
        };
      };
      check_ins: {
        Row: {
          id: string;
          child_id: string;
          playground_id: string;
          posted_by: string;
          // session_id intentionally omitted — internal only, never returned to client
          still_there_prompted_at: string | null;
          checked_in_at: string;
          expires_at: string;
          status: Database['public']['Enums']['checkin_status'];
          source: Database['public']['Enums']['checkin_source'];
          created_at: string;
        };
        Insert: {
          id?: string;
          child_id: string;
          playground_id: string;
          posted_by: string;
          session_id: string;
          still_there_prompted_at?: string | null;
          checked_in_at?: string;
          expires_at: string;
          status?: Database['public']['Enums']['checkin_status'];
          source?: Database['public']['Enums']['checkin_source'];
          created_at?: string;
        };
        Update: {
          id?: string;
          child_id?: string;
          playground_id?: string;
          posted_by?: string;
          session_id?: string;
          still_there_prompted_at?: string | null;
          checked_in_at?: string;
          expires_at?: string;
          status?: Database['public']['Enums']['checkin_status'];
          source?: Database['public']['Enums']['checkin_source'];
          created_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          table_name: string;
          operation: Database['public']['Enums']['audit_operation'];
          row_pk: Json | null;
          actor_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          occurred_at: string;
        };
        Insert: never; // service role only
        Update: never; // service role only
      };
      rate_limit_log: {
        Row: {
          id: string;
          ip_hash: string;
          endpoint: string;
          attempted_at: string;
        };
        Insert: never; // service role only
        Update: never; // service role only
      };
    };
    Views: {
      v_shape_checkins_public: {
        Row: {
          id: string;
          child_id: string;
          playground_id: string;
          posted_by: string;
          still_there_prompted_at: string | null;
          checked_in_at: string;
          expires_at: string;
          status: Database['public']['Enums']['checkin_status'];
          source: Database['public']['Enums']['checkin_source'];
          created_at: string;
        };
      };
      v_shape_children_private: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth: string;
          created_by_guardian_id: string | null;
          created_at: string;
          age_years: number;
        };
      };
      v_shape_children_shared: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          age_years: number;
        };
      };
    };
    Functions: {
      touch_last_active: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_my_children: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_playground_children: {
        Args: { p_playground_id: string };
        Returns: Json;
      };
    };
    Enums: {
      checkin_status: 'active' | 'extended' | 'expired';
      checkin_source: 'app' | 'whatsapp';
      audit_operation: 'INSERT' | 'UPDATE' | 'DELETE';
    };
  };
};
