export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          auth_user_id: string | null
          google_id: string
          email: string
          youtube_access_token: string | null
          youtube_refresh_token: string | null
          youtube_token_expires_at: string | null
          preferences: Json
          fetch_shorts: boolean
          api_key_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          google_id: string
          email: string
          youtube_access_token?: string | null
          youtube_refresh_token?: string | null
          youtube_token_expires_at?: string | null
          preferences?: Json
          fetch_shorts?: boolean
          api_key_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          google_id?: string
          email?: string
          youtube_access_token?: string | null
          youtube_refresh_token?: string | null
          youtube_token_expires_at?: string | null
          preferences?: Json
          fetch_shorts?: boolean
          api_key_hash?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      channels: {
        Row: {
          id: string
          youtube_id: string
          title: string
          thumbnail: string | null
          uploads_playlist_id: string | null
          activity_level: 'high' | 'medium' | 'low'
          last_fetched_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          youtube_id: string
          title: string
          thumbnail?: string | null
          uploads_playlist_id?: string | null
          activity_level?: 'high' | 'medium' | 'low'
          last_fetched_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          youtube_id?: string
          title?: string
          thumbnail?: string | null
          uploads_playlist_id?: string | null
          activity_level?: 'high' | 'medium' | 'low'
          last_fetched_at?: string | null
          created_at?: string
        }
      }
      channel_groups: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          icon: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          icon?: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          icon?: string
          sort_order?: number
          created_at?: string
        }
      }
      group_channels: {
        Row: {
          group_id: string
          channel_id: string
          added_at: string
        }
        Insert: {
          group_id: string
          channel_id: string
          added_at?: string
        }
        Update: {
          group_id?: string
          channel_id?: string
          added_at?: string
        }
      }
      videos: {
        Row: {
          id: string
          youtube_id: string
          channel_id: string
          title: string
          thumbnail: string | null
          duration: string | null
          duration_seconds: number | null
          is_short: boolean
          description: string | null
          published_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          youtube_id: string
          channel_id: string
          title: string
          thumbnail?: string | null
          duration?: string | null
          duration_seconds?: number | null
          is_short?: boolean
          description?: string | null
          published_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          youtube_id?: string
          channel_id?: string
          title?: string
          thumbnail?: string | null
          duration?: string | null
          duration_seconds?: number | null
          is_short?: boolean
          description?: string | null
          published_at?: string | null
          created_at?: string
        }
      }
      watch_status: {
        Row: {
          id: string
          user_id: string
          video_id: string
          watched: boolean
          hidden: boolean
          watch_later: boolean
          watch_progress: number
          watch_progress_seconds: number
          last_position_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          video_id: string
          watched?: boolean
          hidden?: boolean
          watch_later?: boolean
          watch_progress?: number
          watch_progress_seconds?: number
          last_position_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          video_id?: string
          watched?: boolean
          hidden?: boolean
          watch_later?: boolean
          watch_progress?: number
          watch_progress_seconds?: number
          last_position_at?: string
          updated_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          user_id: string
          group_id: string
          name: string
          color: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          group_id: string
          name: string
          color?: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          group_id?: string
          name?: string
          color?: string
          sort_order?: number
          created_at?: string
        }
      }
      video_tags: {
        Row: {
          tag_id: string
          video_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          tag_id: string
          video_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          tag_id?: string
          video_id?: string
          user_id?: string
          created_at?: string
        }
      }
      video_notes: {
        Row: {
          id: string
          user_id: string
          video_id: string
          content: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          video_id: string
          content?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          video_id?: string
          content?: string
          updated_at?: string
        }
      }
      icons: {
        Row: {
          id: number
          emoji: string
          name: string
          category: string
          keywords: string
          sort_order: number
        }
        Insert: {
          id?: number
          emoji: string
          name: string
          category: string
          keywords?: string
          sort_order?: number
        }
        Update: {
          id?: number
          emoji?: string
          name?: string
          category?: string
          keywords?: string
          sort_order?: number
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type User = Database['public']['Tables']['users']['Row']
export type Channel = Database['public']['Tables']['channels']['Row']
export type ChannelGroup = Database['public']['Tables']['channel_groups']['Row']
export type Video = Database['public']['Tables']['videos']['Row']
export type WatchStatus = Database['public']['Tables']['watch_status']['Row']
export type Tag = Database['public']['Tables']['tags']['Row']
export type VideoNote = Database['public']['Tables']['video_notes']['Row']
export type Icon = Database['public']['Tables']['icons']['Row']

// Extended types for API responses
export type VideoWithChannel = Video & {
  channel: Pick<Channel, 'title' | 'thumbnail'>
  watched?: boolean
  hidden?: boolean
  watch_later?: boolean
  watch_progress?: number
  watch_progress_seconds?: number
  last_position_at?: string
}

export type GroupWithChannels = ChannelGroup & {
  channel_ids: string[]
  channel_count: number
}
