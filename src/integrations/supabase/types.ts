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
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: []
      }
      asset_photos: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          is_primary: boolean
          storage_path: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          storage_path: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_photos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_status_history: {
        Row: {
          asset_id: string
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["asset_status"] | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["asset_status"]
        }
        Insert: {
          asset_id: string
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["asset_status"] | null
          id?: string
          note?: string | null
          to_status: Database["public"]["Enums"]["asset_status"]
        }
        Update: {
          asset_id?: string
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["asset_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["asset_status"]
        }
        Relationships: [
          {
            foreignKeyName: "asset_status_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          barcode: string | null
          category_id: string | null
          code: string
          created_at: string
          created_by: string | null
          current_location_id: string | null
          current_value: number | null
          depreciation_method: string | null
          depreciation_rate: number | null
          description: string | null
          id: string
          name: string
          purchase_date: string | null
          purchase_value: number | null
          qr_code: string | null
          quantity: number
          responsible_user_id: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          current_location_id?: string | null
          current_value?: number | null
          depreciation_method?: string | null
          depreciation_rate?: number | null
          description?: string | null
          id?: string
          name: string
          purchase_date?: string | null
          purchase_value?: number | null
          qr_code?: string | null
          quantity?: number
          responsible_user_id?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          current_location_id?: string | null
          current_value?: number | null
          depreciation_method?: string | null
          depreciation_rate?: number | null
          description?: string | null
          id?: string
          name?: string
          purchase_date?: string | null
          purchase_value?: number | null
          qr_code?: string | null
          quantity?: number
          responsible_user_id?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_current_location_id_fkey"
            columns: ["current_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      checkouts: {
        Row: {
          asset_id: string
          checked_out_at: string
          checked_out_by: string | null
          checked_out_to: string | null
          checked_out_to_name: string | null
          condition_in: string | null
          condition_out: string | null
          created_at: string
          event_id: string | null
          expected_return_at: string | null
          id: string
          notes: string | null
          return_received_by: string | null
          return_signature_path: string | null
          returned_at: string | null
          signature_path: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          checked_out_at?: string
          checked_out_by?: string | null
          checked_out_to?: string | null
          checked_out_to_name?: string | null
          condition_in?: string | null
          condition_out?: string | null
          created_at?: string
          event_id?: string | null
          expected_return_at?: string | null
          id?: string
          notes?: string | null
          return_received_by?: string | null
          return_signature_path?: string | null
          returned_at?: string | null
          signature_path?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          checked_out_at?: string
          checked_out_by?: string | null
          checked_out_to?: string | null
          checked_out_to_name?: string | null
          condition_in?: string | null
          condition_out?: string | null
          created_at?: string
          event_id?: string | null
          expected_return_at?: string | null
          id?: string
          notes?: string | null
          return_received_by?: string | null
          return_signature_path?: string | null
          returned_at?: string | null
          signature_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkouts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          contact: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      damage_reports: {
        Row: {
          asset_id: string
          created_at: string
          description: string | null
          id: string
          photo_paths: string[] | null
          reported_at: string
          reported_by: string | null
          service_record_id: string | null
          severity: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          description?: string | null
          id?: string
          photo_paths?: string[] | null
          reported_at?: string
          reported_by?: string | null
          service_record_id?: string | null
          severity?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          description?: string | null
          id?: string
          photo_paths?: string[] | null
          reported_at?: string
          reported_by?: string | null
          service_record_id?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_reports_service_record_id_fkey"
            columns: ["service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["id"]
          },
        ]
      }
      event_assets: {
        Row: {
          asset_id: string
          created_at: string
          event_id: string
          id: string
          notes: string | null
          quantity: number
          reserved_from: string
          reserved_to: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          quantity?: number
          reserved_from: string
          reserved_to: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          reserved_from?: string
          reserved_to?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_assets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_team: {
        Row: {
          created_at: string
          event_id: string
          id: string
          role_on_event: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          role_on_event?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          role_on_event?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_team_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          end_at: string
          id: string
          location_id: string | null
          location_text: string | null
          manager_id: string | null
          name: string
          notes: string | null
          start_at: string
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at: string
          id?: string
          location_id?: string | null
          location_text?: string | null
          manager_id?: string | null
          name: string
          notes?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string
          id?: string
          location_id?: string | null
          location_text?: string | null
          manager_id?: string | null
          name?: string
          notes?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventories: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          location_id: string | null
          name: string
          notes: string | null
          started_at: string
          started_by: string | null
          status: Database["public"]["Enums"]["inventory_status"]
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          type?: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          type?: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lines: {
        Row: {
          asset_id: string
          counted_qty: number | null
          expected_qty: number
          id: string
          inventory_id: string
          note: string | null
          scanned_at: string | null
          scanned_by: string | null
        }
        Insert: {
          asset_id: string
          counted_qty?: number | null
          expected_qty?: number
          id?: string
          inventory_id: string
          note?: string | null
          scanned_at?: string | null
          scanned_by?: string | null
        }
        Update: {
          asset_id?: string
          counted_qty?: number | null
          expected_qty?: number
          id?: string
          inventory_id?: string
          note?: string | null
          scanned_at?: string | null
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lines_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lines_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventories"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          parent_id: string | null
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          parent_id?: string | null
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          parent_id?: string | null
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_records: {
        Row: {
          asset_id: string
          completed_at: string | null
          cost: number | null
          created_at: string
          description: string | null
          id: string
          next_service_due: string | null
          reported_at: string
          reported_by: string | null
          service_provider: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["service_status"]
          type: Database["public"]["Enums"]["service_type"]
          updated_at: string
        }
        Insert: {
          asset_id: string
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          next_service_due?: string | null
          reported_at?: string
          reported_by?: string | null
          service_provider?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Update: {
          asset_id?: string
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          next_service_due?: string | null
          reported_at?: string
          reported_by?: string | null
          service_provider?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "warehouse"
        | "event_manager"
        | "technician"
        | "accounting"
        | "director"
        | "checkout_operator"
      asset_status:
        | "available"
        | "reserved"
        | "at_event"
        | "in_transit"
        | "returned"
        | "damaged"
        | "in_service"
        | "written_off"
      event_status:
        | "draft"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      inventory_status: "open" | "completed" | "cancelled"
      inventory_type: "regular" | "ad_hoc"
      location_type:
        | "warehouse"
        | "shelf"
        | "sector"
        | "vehicle"
        | "field"
        | "backstage"
        | "event_zone"
      reservation_status: "reserved" | "picked" | "returned" | "missing"
      service_status: "reported" | "in_progress" | "completed" | "cancelled"
      service_type: "repair" | "maintenance" | "inspection"
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
      app_role: [
        "admin",
        "warehouse",
        "event_manager",
        "technician",
        "accounting",
        "director",
        "checkout_operator",
      ],
      asset_status: [
        "available",
        "reserved",
        "at_event",
        "in_transit",
        "returned",
        "damaged",
        "in_service",
        "written_off",
      ],
      event_status: [
        "draft",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      inventory_status: ["open", "completed", "cancelled"],
      inventory_type: ["regular", "ad_hoc"],
      location_type: [
        "warehouse",
        "shelf",
        "sector",
        "vehicle",
        "field",
        "backstage",
        "event_zone",
      ],
      reservation_status: ["reserved", "picked", "returned", "missing"],
      service_status: ["reported", "in_progress", "completed", "cancelled"],
      service_type: ["repair", "maintenance", "inspection"],
    },
  },
} as const
