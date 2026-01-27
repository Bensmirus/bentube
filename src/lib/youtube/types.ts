export type YouTubeSubscription = {
  channelId: string
  title: string
  thumbnail: string | null
  uploadsPlaylistId: string | null
}

export type YouTubeVideo = {
  videoId: string
  channelId: string
  channelTitle?: string | null  // Optional - populated for playlist videos
  title: string
  thumbnail: string | null
  duration: string | null
  durationSeconds: number | null
  isShort: boolean
  publishedAt: string | null
}

export type SyncPhase =
  | 'idle'
  | 'starting'
  | 'fetching_subscriptions'
  | 'fetching_channel_details'
  | 'syncing_videos'
  | 'completing'
  | 'complete'
  | 'error'

export type SyncError = {
  channelId?: string
  channelName?: string
  errorCode: string
  message: string
  timestamp: string
}

export type SyncProgress = {
  phase: SyncPhase
  message: string
  current: number
  total: number
  currentItem?: string
  errors: SyncError[]
  startedAt: string
  updatedAt: string
  completedAt?: string
  stats: {
    channelsProcessed: number
    channelsFailed: number
    videosAdded: number
    quotaUsed: number
  }
}

export type SyncResult = {
  success: boolean
  channelsImported: number
  videosImported: number
  channelsFailed?: number
  channelsSkipped?: number
  errors?: { channelId: string; channelName: string; error: string }[]
  durationMs?: number
  quotaUsed?: number
  error?: string
}

export type SyncStatus = {
  isYouTubeConnected: boolean
  tokenExpiresAt: string | null
  totalChannels: number
  totalVideos: number
  lastSyncAt: string | null
}

export type ChannelHealthStatus = 'healthy' | 'warning' | 'unhealthy' | 'dead'

export type ChannelHealth = {
  channelId: string
  youtubeId: string
  status: ChannelHealthStatus
  consecutiveFailures: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastFailureReason: string | null
}

export type QuotaStatus = {
  unitsUsed: number
  dailyLimit: number
  remaining: number
  resetAt: string
  percentUsed: number
  isWarning: boolean
  isCritical: boolean
  isExhausted: boolean
}
