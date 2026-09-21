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
      chunks: {
        Row: {
          chunk_index: number
          chunk_type: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          embedding_model: string | null
          file_path: string | null
          fts: unknown
          id: string
          language: string | null
          line_end: number | null
          line_start: number | null
          metadata: Json
          page_number: number | null
          section: string | null
          source_id: string
          token_estimate: number | null
          user_id: string
        }
        Insert: {
          chunk_index?: number
          chunk_type?: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          embedding_model?: string | null
          file_path?: string | null
          fts?: unknown
          id?: string
          language?: string | null
          line_end?: number | null
          line_start?: number | null
          metadata?: Json
          page_number?: number | null
          section?: string | null
          source_id: string
          token_estimate?: number | null
          user_id?: string
        }
        Update: {
          chunk_index?: number
          chunk_type?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          embedding_model?: string | null
          file_path?: string | null
          fts?: unknown
          id?: string
          language?: string | null
          line_end?: number | null
          line_start?: number | null
          metadata?: Json
          page_number?: number | null
          section?: string | null
          source_id?: string
          token_estimate?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          source_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          source_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          language: string | null
          metadata: Json
          source_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          language?: string | null
          metadata?: Json
          source_id: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          language?: string | null
          metadata?: Json
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_questions: {
        Row: {
          created_at: string
          expected_answer: string | null
          expected_sources: string[]
          id: string
          question: string
          source_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_answer?: string | null
          expected_sources?: string[]
          id?: string
          question: string
          source_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          expected_answer?: string | null
          expected_sources?: string[]
          id?: string
          question?: string
          source_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_questions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_results: {
        Row: {
          answer_relevance: number | null
          context_relevance: number | null
          created_at: string
          error_message: string | null
          faithfulness: number | null
          generated_answer: string | null
          hit: boolean | null
          id: string
          latency_ms: number | null
          mrr: number | null
          precision_at_k: number | null
          question_id: string
          recall_at_k: number | null
          retrieved_sources: string[]
          run_id: string
          user_id: string
        }
        Insert: {
          answer_relevance?: number | null
          context_relevance?: number | null
          created_at?: string
          error_message?: string | null
          faithfulness?: number | null
          generated_answer?: string | null
          hit?: boolean | null
          id?: string
          latency_ms?: number | null
          mrr?: number | null
          precision_at_k?: number | null
          question_id: string
          recall_at_k?: number | null
          retrieved_sources?: string[]
          run_id: string
          user_id?: string
        }
        Update: {
          answer_relevance?: number | null
          context_relevance?: number | null
          created_at?: string
          error_message?: string | null
          faithfulness?: number | null
          generated_answer?: string | null
          hit?: boolean | null
          id?: string
          latency_ms?: number | null
          mrr?: number | null
          precision_at_k?: number | null
          question_id?: string
          recall_at_k?: number | null
          retrieved_sources?: string[]
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_results_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "evaluation_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          chunk_count: number
          config: Json
          created_at: string
          document_count: number
          error_message: string | null
          id: string
          is_demo: boolean
          last_indexed_at: string | null
          name: string
          progress: number
          source_type: Database["public"]["Enums"]["source_kind"]
          source_url: string | null
          stage: string | null
          status: Database["public"]["Enums"]["source_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          chunk_count?: number
          config?: Json
          created_at?: string
          document_count?: number
          error_message?: string | null
          id?: string
          is_demo?: boolean
          last_indexed_at?: string | null
          name: string
          progress?: number
          source_type: Database["public"]["Enums"]["source_kind"]
          source_url?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          chunk_count?: number
          config?: Json
          created_at?: string
          document_count?: number
          error_message?: string | null
          id?: string
          is_demo?: boolean
          last_indexed_at?: string | null
          name?: string
          progress?: number
          source_type?: Database["public"]["Enums"]["source_kind"]
          source_url?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          grounded: boolean | null
          id: string
          mode: string | null
          retrieval_log_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          grounded?: boolean | null
          id?: string
          mode?: string | null
          retrieval_log_id?: string | null
          role: string
          user_id?: string
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          grounded?: boolean | null
          id?: string
          mode?: string | null
          retrieval_log_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      retrieval_logs: {
        Row: {
          answered: boolean | null
          conversation_id: string | null
          created_at: string
          embedding_dimensions: number | null
          embedding_model: string | null
          error_message: string | null
          filters: Json
          final_context: Json
          generation_status: string | null
          hybrid_results: Json
          id: string
          keyword_results: Json
          latency_ms: number | null
          mode: string
          query: string
          request_id: string
          reranked_results: Json
          reranker_model: string | null
          reranker_used: boolean
          retrieval_method: string
          semantic_results: Json
          source_id: string | null
          timings: Json
          user_id: string
        }
        Insert: {
          answered?: boolean | null
          conversation_id?: string | null
          created_at?: string
          embedding_dimensions?: number | null
          embedding_model?: string | null
          error_message?: string | null
          filters?: Json
          final_context?: Json
          generation_status?: string | null
          hybrid_results?: Json
          id?: string
          keyword_results?: Json
          latency_ms?: number | null
          mode?: string
          query: string
          request_id: string
          reranked_results?: Json
          reranker_model?: string | null
          reranker_used?: boolean
          retrieval_method?: string
          semantic_results?: Json
          source_id?: string | null
          timings?: Json
          user_id?: string
        }
        Update: {
          answered?: boolean | null
          conversation_id?: string | null
          created_at?: string
          embedding_dimensions?: number | null
          embedding_model?: string | null
          error_message?: string | null
          filters?: Json
          final_context?: Json
          generation_status?: string | null
          hybrid_results?: Json
          id?: string
          keyword_results?: Json
          latency_ms?: number | null
          mode?: string
          query?: string
          request_id?: string
          reranked_results?: Json
          reranker_model?: string | null
          reranker_used?: boolean
          retrieval_method?: string
          semantic_results?: Json
          source_id?: string | null
          timings?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retrieval_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrieval_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      keyword_search_chunks: {
        Args: {
          match_count?: number
          p_file_type?: string
          p_language?: string
          p_source_id?: string
          query_text: string
        }
        Returns: {
          chunk_type: string
          content: string
          document_id: string
          file_path: string
          id: string
          keyword_score: number
          language: string
          line_end: number
          line_start: number
          metadata: Json
          page_number: number
          section: string
          source_id: string
        }[]
      }
      match_chunks: {
        Args: {
          match_count?: number
          p_file_type?: string
          p_language?: string
          p_source_id?: string
          query_embedding: string
        }
        Returns: {
          chunk_type: string
          content: string
          document_id: string
          file_path: string
          id: string
          language: string
          line_end: number
          line_start: number
          metadata: Json
          page_number: number
          section: string
          similarity: number
          source_id: string
        }[]
      }
    }
    Enums: {
      source_kind: "github" | "pdf" | "markdown" | "txt" | "demo"
      source_status: "pending" | "processing" | "indexed" | "failed"
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
      source_kind: ["github", "pdf", "markdown", "txt", "demo"],
      source_status: ["pending", "processing", "indexed", "failed"],
    },
  },
} as const
