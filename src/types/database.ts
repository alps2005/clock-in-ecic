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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attendance_events: {
        Row: {
          checkpoint_id: string | null
          id: string
          justification: string | null
          kind: string
          occurred_at: string
          policy_id: string
          request_hash: string
          request_id: string
          school_date: string
          sequence_no: number
          teacher_id: string
        }
        Insert: {
          checkpoint_id?: string | null
          id?: string
          justification?: string | null
          kind: string
          occurred_at: string
          policy_id: string
          request_hash: string
          request_id: string
          school_date: string
          sequence_no: number
          teacher_id: string
        }
        Update: {
          checkpoint_id?: string | null
          id?: string
          justification?: string | null
          kind?: string
          occurred_at?: string
          policy_id?: string
          request_hash?: string
          request_id?: string
          school_date?: string
          sequence_no?: number
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "attendance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_policies: {
        Row: {
          effective: unknown
          entry_closes: string
          entry_opens: string
          exit_closes: string
          exit_opens: string
          id: string
          timezone: string
          weekdays: number[]
        }
        Insert: {
          effective: unknown
          entry_closes: string
          entry_opens: string
          exit_closes: string
          exit_opens: string
          id?: string
          timezone: string
          weekdays: number[]
        }
        Update: {
          effective?: unknown
          entry_closes?: string
          entry_opens?: string
          exit_closes?: string
          exit_opens?: string
          id?: string
          timezone?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      checkpoints: {
        Row: {
          active: boolean
          id: string
          label: string
        }
        Insert: {
          active?: boolean
          id?: string
          label: string
        }
        Update: {
          active?: boolean
          id?: string
          label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_deleted_at: string | null
          active: boolean
          auth_user_id: string | null
          cedula: string | null
          created_at: string
          full_name: string
          id: string
          role: string
          session_version: number
          username: string | null
        }
        Insert: {
          account_deleted_at?: string | null
          active?: boolean
          auth_user_id?: string | null
          cedula?: string | null
          created_at?: string
          full_name: string
          id?: string
          role?: string
          session_version?: number
          username?: string | null
        }
        Update: {
          account_deleted_at?: string | null
          active?: boolean
          auth_user_id?: string | null
          cedula?: string | null
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          session_version?: number
          username?: string | null
        }
        Relationships: []
      }
      school_holidays: {
        Row: {
          label: string
          school_date: string
        }
        Insert: {
          label: string
          school_date: string
        }
        Update: {
          label?: string
          school_date?: string
        }
        Relationships: []
      }
      teachers: {
        Row: {
          employed_from: string
          employed_until: string | null
          id: string
        }
        Insert: {
          employed_from: string
          employed_until?: string | null
          id: string
        }
        Update: {
          employed_from?: string
          employed_until?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_profile: {
        Args: {
          p_auth_user_id: string
          p_employed_from?: string
          p_profile_id: string
        }
        Returns: undefined
      }
      admin_notifications: { Args: { p_page?: number }; Returns: Json }
      admin_read_notification: { Args: { p_id: string }; Returns: Json }
      admin_sidebar_counts: { Args: never; Returns: Json }
      admin_teacher: { Args: { p_id: string }; Returns: Json }
      admin_teacher_report: {
        Args: { p_from: string; p_id: string; p_page?: number; p_to: string }
        Returns: Json
      }
      admin_teachers: {
        Args: { p_page?: number; p_search?: string }
        Returns: Json
      }
      app_context: { Args: never; Returns: Json }
      attendance_report: {
        Args: {
          p_from: string
          p_page?: number
          p_search?: string
          p_to: string
        }
        Returns: Json
      }
      configure_checkpoint: {
        Args: { p_id: string; p_label: string; p_payload: string }
        Returns: undefined
      }
      finish_teacher_admin: {
        Args: {
          p_active: boolean
          p_auth_id: string
          p_cedula: string
          p_from: string
          p_full_name: string
          p_id: string
          p_key: string
          p_role?: string
          p_token: string
          p_until: string
          p_version: number
        }
        Returns: undefined
      }
      finish_teacher_delete: {
        Args: {
          p_id: string
          p_key: string
          p_token: string
          p_version: number
        }
        Returns: undefined
      }
      lock_teacher_admin: { Args: { p_key: string }; Returns: string }
      record_attendance: {
        Args: {
          p_justification?: string
          p_kind: string
          p_prior_sequence: number
          p_qr?: string
          p_request_id: string
          p_school_date: string
        }
        Returns: Json
      }
      unlock_teacher_admin: {
        Args: { p_key: string; p_token: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
