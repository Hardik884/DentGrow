export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      appointment_history: {
        Row: {
          action: Database["public"]["Enums"]["appointment_history_action"]
          appointment_id: string
          id: string
          new_value: Json | null
          old_value: Json | null
          performed_by: string | null
          timestamp: string
        }
        Insert: {
          action: Database["public"]["Enums"]["appointment_history_action"]
          appointment_id: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          timestamp?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["appointment_history_action"]
          appointment_id?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_history_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          chief_complaints: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dentist_id: string
          duration_minutes: number
          follow_up_id: string | null
          id: string
          medical_history: Json | null
          notes: string | null
          oral_findings: string | null
          patient_id: string
          provisional_diagnosis: string | null
          scheduled_at: string
          source: Database["public"]["Enums"]["appointment_source"]
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          chief_complaints?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dentist_id: string
          duration_minutes?: number
          follow_up_id?: string | null
          id?: string
          medical_history?: Json | null
          notes?: string | null
          oral_findings?: string | null
          patient_id: string
          provisional_diagnosis?: string | null
          scheduled_at: string
          source: Database["public"]["Enums"]["appointment_source"]
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          chief_complaints?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dentist_id?: string
          duration_minutes?: number
          follow_up_id?: string | null
          id?: string
          medical_history?: Json | null
          notes?: string | null
          oral_findings?: string | null
          patient_id?: string
          provisional_diagnosis?: string | null
          scheduled_at?: string
          source?: Database["public"]["Enums"]["appointment_source"]
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "active_follow_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "overdue_follow_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          clinic_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          slot_duration_minutes: number
          start_time: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          slot_duration_minutes?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          slot_duration_minutes?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_settings: {
        Row: {
          address: string | null
          allow_receptionist_payments: boolean
          average_appointment_duration: number
          chair_count: number
          clinic_hours: Json | null
          clinic_id: string
          clinic_name: string
          created_at: string
          default_opd_fee: number | null
          email: string | null
          enable_xray_charges: boolean
          phone: string | null
          registration_number: string | null
          show_consultancy_on_dashboard: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          allow_receptionist_payments?: boolean
          average_appointment_duration?: number
          chair_count?: number
          clinic_hours?: Json | null
          clinic_id: string
          clinic_name: string
          created_at?: string
          default_opd_fee?: number | null
          email?: string | null
          enable_xray_charges?: boolean
          phone?: string | null
          registration_number?: string | null
          show_consultancy_on_dashboard?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          allow_receptionist_payments?: boolean
          average_appointment_duration?: number
          chair_count?: number
          clinic_hours?: Json | null
          clinic_id?: string
          clinic_name?: string
          created_at?: string
          default_opd_fee?: number | null
          email?: string | null
          enable_xray_charges?: boolean
          phone?: string | null
          registration_number?: string | null
          show_consultancy_on_dashboard?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_settings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          created_at: string
          dentist_name: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          dentist_name?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          dentist_name?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      consultancy_income: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          date: string
          dentist_id: string
          description: string | null
          external_clinic: string | null
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          clinic_id: string
          created_at?: string
          date: string
          dentist_id: string
          description?: string | null
          external_clinic?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          date?: string
          dentist_id?: string
          description?: string | null
          external_clinic?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultancy_income_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultancy_income_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultancy_schedules: {
        Row: {
          clinic_id: string
          created_at: string
          date: string
          dentist_id: string | null
          end_time: string
          id: string
          is_active: boolean
          reason: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          date: string
          dentist_id?: string | null
          end_time: string
          id?: string
          is_active?: boolean
          reason?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          date?: string
          dentist_id?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultancy_schedules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultancy_schedules_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultants: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultants_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          confirmation_status: Database["public"]["Enums"]["follow_up_confirmation_status"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string
          follow_up_type: string
          id: string
          notes: string | null
          patient_id: string
          status: Database["public"]["Enums"]["follow_up_status"]
          treatment_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          confirmation_status?: Database["public"]["Enums"]["follow_up_confirmation_status"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date: string
          follow_up_type?: string
          id?: string
          notes?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["follow_up_status"]
          treatment_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          confirmation_status?: Database["public"]["Enums"]["follow_up_confirmation_status"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string
          follow_up_type?: string
          id?: string
          notes?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["follow_up_status"]
          treatment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "active_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "patient_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "receptionist_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_history: {
        Row: {
          clinic_id: string
          created_at: string
          measured_at: string
          metric_date: string
          metric_key: string
          value: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          measured_at: string
          metric_date: string
          metric_key: string
          value: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          measured_at?: string
          metric_date?: string
          metric_key?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_history_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_portal_links: {
        Row: {
          created_at: string
          id: string
          patient_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          patient_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          patient_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_portal_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_portal_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_self_registered: boolean
          last_visit: string | null
          name: string
          notes: string | null
          phone: string | null
          portal_registered_at: string | null
          total_visits: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_self_registered?: boolean
          last_visit?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          portal_registered_at?: string | null
          total_visits?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_self_registered?: boolean
          last_visit?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          portal_registered_at?: string | null
          total_visits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          patient_id: string
          payment_date: string
          payment_type: string
          treatment_id: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          patient_id: string
          payment_date?: string
          payment_type?: string
          treatment_id?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          patient_id?: string
          payment_date?: string
          payment_type?: string
          treatment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "active_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "patient_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "receptionist_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          clinic_id: string
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          signature_url: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          signature_url?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          signature_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_entries: {
        Row: {
          appointment_id: string
          called_at: string | null
          checked_in_at: string
          clinic_id: string
          completed_at: string | null
          id: string
          patient_id: string
          position: number
          queue_date: string
          status: Database["public"]["Enums"]["queue_status"]
        }
        Insert: {
          appointment_id: string
          called_at?: string | null
          checked_in_at?: string
          clinic_id: string
          completed_at?: string | null
          id?: string
          patient_id: string
          position: number
          queue_date?: string
          status?: Database["public"]["Enums"]["queue_status"]
        }
        Update: {
          appointment_id?: string
          called_at?: string | null
          checked_in_at?: string
          clinic_id?: string
          completed_at?: string | null
          id?: string
          patient_id?: string
          position?: number
          queue_date?: string
          status?: Database["public"]["Enums"]["queue_status"]
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_documents: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          document_type: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          patient_id: string
          treatment_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          patient_id: string
          treatment_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          patient_id?: string
          treatment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "active_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "patient_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "receptionist_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_documents_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          appointment_id: string
          clinic_id: string
          clinic_share: number | null
          commission_type: string | null
          commission_value: number | null
          consultant_id: string | null
          consultant_share: number | null
          cost: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          internal_notes: string | null
          medications: Json
          opd_charged: boolean
          opd_fee: number
          patient_id: string
          patient_visible_notes: string | null
          performed_at: string | null
          status: Database["public"]["Enums"]["treatment_status"]
          treatment_type: string
          updated_at: string
          xray_cost: number | null
          xray_taken: boolean
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          clinic_share?: number | null
          commission_type?: string | null
          commission_value?: number | null
          consultant_id?: string | null
          consultant_share?: number | null
          cost?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          internal_notes?: string | null
          medications?: Json
          opd_charged?: boolean
          opd_fee?: number
          patient_id: string
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"]
          treatment_type: string
          updated_at?: string
          xray_cost?: number | null
          xray_taken?: boolean
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          clinic_share?: number | null
          commission_type?: string | null
          commission_value?: number | null
          consultant_id?: string | null
          consultant_share?: number | null
          cost?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          internal_notes?: string | null
          medications?: Json
          opd_charged?: boolean
          opd_fee?: number
          patient_id?: string
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"]
          treatment_type?: string
          updated_at?: string
          xray_cost?: number | null
          xray_taken?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      unavailable_dates: {
        Row: {
          clinic_id: string
          created_at: string
          date: string
          dentist_id: string | null
          id: string
          reason: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          date: string
          dentist_id?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          date?: string
          dentist_id?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unavailable_dates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unavailable_dates_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          clinic_id: string | null
          event_type: string
          id: string
          payload: Json | null
          received_at: string
        }
        Insert: {
          clinic_id?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          received_at?: string
        }
        Update: {
          clinic_id?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_appointments: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          deleted_at: string | null
          dentist_id: string | null
          duration_minutes: number | null
          id: string | null
          notes: string | null
          patient_id: string | null
          scheduled_at: string | null
          source: Database["public"]["Enums"]["appointment_source"] | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          dentist_id?: string | null
          duration_minutes?: number | null
          id?: string | null
          notes?: string | null
          patient_id?: string | null
          scheduled_at?: string | null
          source?: Database["public"]["Enums"]["appointment_source"] | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          dentist_id?: string | null
          duration_minutes?: number | null
          id?: string | null
          notes?: string | null
          patient_id?: string | null
          scheduled_at?: string | null
          source?: Database["public"]["Enums"]["appointment_source"] | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dentist_id_fkey"
            columns: ["dentist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      active_follow_ups: {
        Row: {
          appointment_id: string | null
          clinic_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          follow_up_type: string | null
          id: string | null
          notes: string | null
          patient_id: string | null
          status: Database["public"]["Enums"]["follow_up_status"] | null
          treatment_id: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          follow_up_type?: string | null
          id?: string | null
          notes?: string | null
          patient_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"] | null
          treatment_id?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          follow_up_type?: string | null
          id?: string | null
          notes?: string | null
          patient_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"] | null
          treatment_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "active_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "patient_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "receptionist_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      active_patients: {
        Row: {
          address: string | null
          clinic_id: string | null
          created_at: string | null
          date_of_birth: string | null
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string | null
          last_visit: string | null
          name: string | null
          notes: string | null
          phone: string | null
          total_visits: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          clinic_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string | null
          last_visit?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          clinic_id?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string | null
          last_visit?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      active_payments: {
        Row: {
          amount: number | null
          appointment_id: string | null
          clinic_id: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          patient_id: string | null
          payment_date: string | null
        }
        Insert: {
          amount?: number | null
          appointment_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          patient_id?: string | null
          payment_date?: string | null
        }
        Update: {
          amount?: number | null
          appointment_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          patient_id?: string | null
          payment_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      active_treatments: {
        Row: {
          appointment_id: string | null
          clinic_id: string | null
          cost: number | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          internal_notes: string | null
          patient_id: string | null
          patient_visible_notes: string | null
          performed_at: string | null
          status: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id?: string | null
          cost?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          internal_notes?: string | null
          patient_id?: string | null
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string | null
          cost?: number | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          internal_notes?: string | null
          patient_id?: string | null
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      overdue_follow_ups: {
        Row: {
          appointment_id: string | null
          clinic_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          follow_up_type: string | null
          id: string | null
          notes: string | null
          patient_id: string | null
          status: Database["public"]["Enums"]["follow_up_status"] | null
          treatment_id: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          follow_up_type?: string | null
          id?: string | null
          notes?: string | null
          patient_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"] | null
          treatment_id?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          follow_up_type?: string | null
          id?: string | null
          notes?: string | null
          patient_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"] | null
          treatment_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "active_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "patient_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "receptionist_treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_treatments: {
        Row: {
          appointment_id: string | null
          clinic_id: string | null
          cost: number | null
          created_at: string | null
          id: string | null
          patient_id: string | null
          patient_visible_notes: string | null
          performed_at: string | null
          status: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string | null
          patient_id?: string | null
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string | null
          patient_id?: string | null
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      receptionist_treatments: {
        Row: {
          appointment_id: string | null
          clinic_id: string | null
          cost: number | null
          created_at: string | null
          id: string | null
          patient_id: string | null
          patient_visible_notes: string | null
          performed_at: string | null
          status: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type: string | null
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string | null
          patient_id?: string | null
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type?: string | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string | null
          patient_id?: string | null
          patient_visible_notes?: string | null
          performed_at?: string | null
          status?: Database["public"]["Enums"]["treatment_status"] | null
          treatment_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "active_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "active_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_clinic_id: { Args: never; Returns: string }
      auth_patient_id: { Args: never; Returns: string }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      bulk_decrement_queue_positions: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      create_patient_appointment: {
        Args: { p_notes?: string; p_patient_id: string; p_scheduled_at: string }
        Returns: string
      }
      run_metric_history_job: { Args: never; Returns: undefined }
    }
    Enums: {
      appointment_history_action:
        | "created"
        | "rescheduled"
        | "cancelled"
        | "status_changed"
      appointment_source:
        | "walk_in"
        | "phone_call"
        | "website"
        | "referral"
        | "other"
      appointment_status:
        | "scheduled"
        | "checked_in"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      follow_up_confirmation_status: "tentative" | "confirmed"
      follow_up_status: "pending" | "completed" | "cancelled"
      gender_type: "male" | "female" | "other"
      payment_method: "cash" | "upi" | "card" | "bank_transfer"
      queue_status: "waiting" | "in_progress" | "completed"
      treatment_status: "planned" | "in_progress" | "completed" | "cancelled"
      user_role: "dentist" | "receptionist" | "patient"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_history_action: [
        "created",
        "rescheduled",
        "cancelled",
        "status_changed",
      ],
      appointment_source: [
        "walk_in",
        "phone_call",
        "website",
        "referral",
        "other",
      ],
      appointment_status: [
        "scheduled",
        "checked_in",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      follow_up_confirmation_status: ["tentative", "confirmed"],
      follow_up_status: ["pending", "completed", "cancelled"],
      gender_type: ["male", "female", "other"],
      payment_method: ["cash", "upi", "card", "bank_transfer"],
      queue_status: ["waiting", "in_progress", "completed"],
      treatment_status: ["planned", "in_progress", "completed", "cancelled"],
      user_role: ["dentist", "receptionist", "patient"],
    },
  },
} as const

