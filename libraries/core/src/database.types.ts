WARN: no SMS provider is enabled. Disabling phone login
Initialising login role...
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
  public: {
    Tables: {
      account_master_cover_letter: {
        Row: {
          account_id: string
          content_jsonb: Json
          updated_at: string
          uploaded_at: string
          uploaded_filename: string | null
        }
        Insert: {
          account_id: string
          content_jsonb?: Json
          updated_at?: string
          uploaded_at?: string
          uploaded_filename?: string | null
        }
        Update: {
          account_id?: string
          content_jsonb?: Json
          updated_at?: string
          uploaded_at?: string
          uploaded_filename?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_master_cover_letter_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_master_resume: {
        Row: {
          account_id: string
          content_jsonb: Json
          updated_at: string
          uploaded_at: string
          uploaded_filename: string | null
        }
        Insert: {
          account_id: string
          content_jsonb?: Json
          updated_at?: string
          uploaded_at?: string
          uploaded_filename?: string | null
        }
        Update: {
          account_id?: string
          content_jsonb?: Json
          updated_at?: string
          uploaded_at?: string
          uploaded_filename?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_master_resume_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_members: {
        Row: {
          account_id: string
          added_at: string
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          added_at?: string
          role?: string
          user_id: string
        }
        Update: {
          account_id?: string
          added_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      advanced_matching: {
        Row: {
          ai_api_cost: number
          ai_api_input_tokens_used: number
          ai_api_output_tokens_used: number
          blacklisted_companies: string[]
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          ai_api_cost?: number
          ai_api_input_tokens_used?: number
          ai_api_output_tokens_used?: number
          blacklisted_companies?: string[]
          created_at?: string
          id?: number
          user_id?: string
        }
        Update: {
          ai_api_cost?: number
          ai_api_input_tokens_used?: number
          ai_api_output_tokens_used?: number
          blacklisted_companies?: string[]
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_filter_profiles: {
        Row: {
          blacklisted_companies: string[]
          chatgpt_prompt: string
          created_at: string
          id: number
          is_default: boolean
          name: string
          user_id: string
        }
        Insert: {
          blacklisted_companies?: string[]
          chatgpt_prompt?: string
          created_at?: string
          id?: number
          is_default?: boolean
          name: string
          user_id?: string
        }
        Update: {
          blacklisted_companies?: string[]
          chatgpt_prompt?: string
          created_at?: string
          id?: number
          is_default?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          cost: number
          input_tokens: number
          output_tokens: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          cost?: number
          input_tokens?: number
          output_tokens?: number
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          cost?: number
          input_tokens?: number
          output_tokens?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      approval_tokens: {
        Row: {
          consumed_at: string | null
          expires_at: string
          job_id: string
          jti: string
        }
        Insert: {
          consumed_at?: string | null
          expires_at: string
          job_id: string
          jti: string
        }
        Update: {
          consumed_at?: string | null
          expires_at?: string
          job_id?: string
          jti?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          id: number
          linkedin_url: string | null
          mission_keywords_jsonb: Json | null
          name: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          linkedin_url?: string | null
          mission_keywords_jsonb?: Json | null
          name: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          linkedin_url?: string | null
          mission_keywords_jsonb?: Json | null
          name?: string
          website_url?: string | null
        }
        Relationships: []
      }
      cover_letter_versions: {
        Row: {
          content_jsonb: Json
          created_at: string
          id: number
          link_id: number | null
          model: string
          profile_id: number | null
        }
        Insert: {
          content_jsonb: Json
          created_at?: string
          id?: number
          link_id?: number | null
          model?: string
          profile_id?: number | null
        }
        Update: {
          content_jsonb?: Json
          created_at?: string
          id?: number
          link_id?: number | null
          model?: string
          profile_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cover_letter_versions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cover_letter_versions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "ai_filter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      html_dumps: {
        Row: {
          created_at: string
          html: string
          id: number
          url: string
          user_id: string
          webpage_runtime_data: Json | null
        }
        Insert: {
          created_at?: string
          html: string
          id?: number
          url: string
          user_id?: string
          webpage_runtime_data?: Json | null
        }
        Update: {
          created_at?: string
          html?: string
          id?: number
          url?: string
          user_id?: string
          webpage_runtime_data?: Json | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          approval_state: string
          companyLogo: string | null
          companyName: string
          created_at: string
          description: string | null
          exclude_reason: string | null
          externalId: string
          externalUrl: string
          id: number
          job_search_vector: unknown
          jobType: string | null
          labels: string[]
          link_id: number | null
          location: string | null
          notified_pushover_at: string | null
          salary: string | null
          siteId: number
          status: Database["public"]["Enums"]["Job Status"]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_state?: string
          companyLogo?: string | null
          companyName: string
          created_at?: string
          description?: string | null
          exclude_reason?: string | null
          externalId: string
          externalUrl: string
          id?: number
          job_search_vector?: unknown
          jobType?: string | null
          labels?: string[]
          link_id?: number | null
          location?: string | null
          notified_pushover_at?: string | null
          salary?: string | null
          siteId: number
          status?: Database["public"]["Enums"]["Job Status"]
          tags?: string[]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          approval_state?: string
          companyLogo?: string | null
          companyName?: string
          created_at?: string
          description?: string | null
          exclude_reason?: string | null
          externalId?: string
          externalUrl?: string
          id?: number
          job_search_vector?: unknown
          jobType?: string | null
          labels?: string[]
          link_id?: number | null
          location?: string | null
          notified_pushover_at?: string | null
          salary?: string | null
          siteId?: number
          status?: Database["public"]["Enums"]["Job Status"]
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_siteid_fkey"
            columns: ["siteId"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_jobs_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string
          filter_profile_id: number | null
          id: number
          keywords_jsonb: Json | null
          last_scraped_at: string
          scan_frequency: string
          scrape_failure_count: number
          scrape_failure_email_sent: boolean
          site_id: number
          title: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filter_profile_id?: number | null
          id?: number
          keywords_jsonb?: Json | null
          last_scraped_at?: string
          scan_frequency?: string
          scrape_failure_count?: number
          scrape_failure_email_sent?: boolean
          site_id: number
          title: string
          url: string
          user_id?: string
        }
        Update: {
          created_at?: string
          filter_profile_id?: number | null
          id?: number
          keywords_jsonb?: Json | null
          last_scraped_at?: string
          scan_frequency?: string
          scrape_failure_count?: number
          scrape_failure_email_sent?: boolean
          site_id?: number
          title?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_filter_profile_id_fkey"
            columns: ["filter_profile_id"]
            isOneToOne: false
            referencedRelation: "ai_filter_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          created_at: string
          files: string[]
          id: number
          job_id: number
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          files?: string[]
          id?: number
          job_id: number
          text: string
          user_id?: string
        }
        Update: {
          created_at?: string
          files?: string[]
          id?: number
          job_id?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_id: string | null
          created_at: string
          id: number
          is_trial: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_end_date: string
          subscription_tier: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: number
          is_trial?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string
          subscription_tier?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: number
          is_trial?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_end_date?: string
          subscription_tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_versions: {
        Row: {
          content_jsonb: Json
          created_at: string
          id: number
          link_id: number | null
          model: string
          profile_id: number | null
        }
        Insert: {
          content_jsonb: Json
          created_at?: string
          id?: number
          link_id?: number | null
          model?: string
          profile_id?: number | null
        }
        Update: {
          content_jsonb?: Json
          created_at?: string
          id?: number
          link_id?: number | null
          model?: string
          profile_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "ai_filter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string
          description: string | null
          id: number
          rating: number
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          rating: number
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          rating?: number
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          blacklisted_paths: string[]
          created_at: string
          deprecated: boolean
          id: number
          incognito_support: boolean
          logo_url: string
          name: string
          provider: string
          queryParamsToRemove: string[] | null
          urls: string[]
        }
        Insert: {
          blacklisted_paths?: string[]
          created_at?: string
          deprecated?: boolean
          id?: number
          incognito_support?: boolean
          logo_url: string
          name: string
          provider: string
          queryParamsToRemove?: string[] | null
          urls: string[]
        }
        Update: {
          blacklisted_paths?: string[]
          created_at?: string
          deprecated?: boolean
          id?: number
          incognito_support?: boolean
          logo_url?: string
          name?: string
          provider?: string
          queryParamsToRemove?: string[] | null
          urls?: string[]
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          last_summary_sent_at: string | null
          pushover_owner_device_id: string | null
          quiet_hours_enabled: boolean
          quiet_hours_grace_minutes: number
          quiet_hours_schedule: Json
          quiet_hours_timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_summary_sent_at?: string | null
          pushover_owner_device_id?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_grace_minutes?: number
          quiet_hours_schedule?: Json
          quiet_hours_timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_summary_sent_at?: string | null
          pushover_owner_device_id?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_grace_minutes?: number
          quiet_hours_schedule?: Json
          quiet_hours_timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_ai_usage_last_30d: {
        Row: {
          cost_last_30d: number | null
          input_tokens_last_30d: number | null
          output_tokens_last_30d: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_summary_send: {
        Args: { p_user_id: string; p_window_end: string }
        Returns: number
      }
      count_chatgpt_usage: {
        Args: {
          cost_increment: number
          for_user_id: string
          input_tokens_increment: number
          output_tokens_increment: number
        }
        Returns: undefined
      }
      count_jobs: {
        Args: {
          jobs_labels?: string[]
          jobs_link_ids?: number[]
          jobs_search?: string
          jobs_site_ids?: number[]
          jobs_status?: Database["public"]["Enums"]["Job Status"]
        }
        Returns: {
          job_count: number
          status: Database["public"]["Enums"]["Job Status"]
        }[]
      }
      get_user_id_by_email: {
        Args: { email: string }
        Returns: {
          id: string
        }[]
      }
      list_jobs: {
        Args: {
          jobs_after: string
          jobs_labels?: string[]
          jobs_link_ids?: number[]
          jobs_page_size: number
          jobs_search?: string
          jobs_site_ids?: number[]
          jobs_status: Database["public"]["Enums"]["Job Status"]
        }
        Returns: {
          approval_state: string
          companyLogo: string | null
          companyName: string
          created_at: string
          description: string | null
          exclude_reason: string | null
          externalId: string
          externalUrl: string
          id: number
          job_search_vector: unknown
          jobType: string | null
          labels: string[]
          link_id: number | null
          location: string | null
          notified_pushover_at: string | null
          salary: string | null
          siteId: number
          status: Database["public"]["Enums"]["Job Status"]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_ai_usage: {
        Args: {
          cost_increment: number
          for_user_id: string
          input_tokens_increment: number
          output_tokens_increment: number
        }
        Returns: undefined
      }
      set_default_filter_profile: { Args: { p_id: number }; Returns: undefined }
    }
    Enums: {
      "Job Status":
        | "new"
        | "applied"
        | "archived"
        | "processing"
        | "excluded_by_advanced_matching"
        | "deleted"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      "Job Status": [
        "new",
        "applied",
        "archived",
        "processing",
        "excluded_by_advanced_matching",
        "deleted",
      ],
    },
  },
} as const
A new version of Supabase CLI is available: v2.95.4 (currently installed v2.90.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
