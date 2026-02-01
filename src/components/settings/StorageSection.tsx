'use client'

import { useState, useEffect } from 'react'

interface ChannelStats {
  channel_id: string
  title: string
  thumbnail: string | null
  video_count: number
}

interface StorageStats {
  totalVideos: number
  totalChannels: number
  limit: number
  usagePercent: number
  isNearLimit: boolean
  isAtLimit: boolean
  channelsBySize: ChannelStats[]
  cleanup: {
    olderThan6Months: number
    olderThan1Year: number
    olderThan2Years: number
  }
}

type CleanupPeriod = 6 | 12 | 24

export default function StorageSection() {
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<CleanupPeriod | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletingChannel, setDeletingChannel] = useState<string | null>(null)
  const [showAllChannels, setShowAllChannels] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'date' | 'channel'; id?: string; months?: number } | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/storage/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch storage stats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const getVideosForPeriod = (period: CleanupPeriod): number => {
    if (!stats) return 0
    switch (period) {
      case 6: return stats.cleanup.olderThan6Months
      case 12: return stats.cleanup.olderThan1Year
      case 24: return stats.cleanup.olderThan2Years
    }
  }

  const handleDateCleanup = async () => {
    if (!selectedPeriod) return

    setDeleting(true)
    setSuccessMessage(null)
    try {
      const res = await fetch('/api/storage/cleanup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'date', olderThanMonths: selectedPeriod })
      })

      if (res.ok) {
        const data = await res.json()
        await fetchStats()
        setSelectedPeriod(null)
        setConfirmDelete(null)
        setSuccessMessage(`Removed ${data.deletedCount.toLocaleString()} videos`)
        setTimeout(() => setSuccessMessage(null), 5000)
      }
    } catch (error) {
      console.error('Cleanup failed:', error)
    } finally {
      setDeleting(false)
    }
  }

  const handleChannelRemove = async (channelId: string, olderThanMonths?: number) => {
    setDeletingChannel(channelId)
    setSuccessMessage(null)
    try {
      const res = await fetch('/api/storage/cleanup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'channel', channelId, olderThanMonths })
      })

      if (res.ok) {
        const data = await res.json()
        await fetchStats()
        setConfirmDelete(null)
        setSuccessMessage(`Removed ${data.deletedCount.toLocaleString()} videos`)
        setTimeout(() => setSuccessMessage(null), 5000)
      }
    } catch (error) {
      console.error('Channel removal failed:', error)
    } finally {
      setDeletingChannel(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Failed to load storage statistics
      </div>
    )
  }

  const displayedChannels = showAllChannels
    ? stats.channelsBySize
    : stats.channelsBySize.slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Storage</h2>
        <p className="text-sm text-muted-foreground">
          Manage your video library and free up space.
        </p>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl px-4 py-3 text-sm font-medium">
          {successMessage}
        </div>
      )}

      {/* Overview */}
      <div className={`rounded-xl p-4 ${stats.isAtLimit ? 'bg-red-50 dark:bg-red-900/20' : stats.isNearLimit ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-muted/50'}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">
            {stats.totalVideos.toLocaleString()}
          </span>
          <span className="text-lg text-muted-foreground">
            / {stats.limit.toLocaleString()}
          </span>
        </div>
        <div className="text-sm text-muted-foreground mb-3">
          videos across {stats.totalChannels} channels
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${stats.isAtLimit ? 'bg-red-500' : stats.isNearLimit ? 'bg-amber-500' : 'bg-accent'}`}
            style={{ width: `${Math.min(stats.usagePercent * 100, 100)}%` }}
          />
        </div>

        {stats.isAtLimit && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-3">
            Video limit reached. Remove some videos below to continue syncing.
          </p>
        )}
        {stats.isNearLimit && !stats.isAtLimit && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
            Approaching the video limit ({Math.round(stats.usagePercent * 100)}% used).
          </p>
        )}
      </div>

      {/* Quick Cleanup */}
      <div className="pt-4 border-t space-y-4">
        <h3 className="text-sm font-medium">Quick Cleanup</h3>
        <p className="text-xs text-muted-foreground">
          Remove videos older than a certain date. This action cannot be undone.
        </p>

        <div className="flex flex-wrap gap-2">
          {([6, 12, 24] as CleanupPeriod[]).map((months) => {
            const count = getVideosForPeriod(months)
            const label = months === 6 ? '6 months' : months === 12 ? '1 year' : '2 years'

            return (
              <button
                key={months}
                onClick={() => setSelectedPeriod(selectedPeriod === months ? null : months)}
                disabled={count === 0}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  selectedPeriod === months
                    ? 'bg-accent text-white'
                    : count === 0
                      ? 'bg-muted text-muted-foreground/50 cursor-not-allowed'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {selectedPeriod && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 space-y-3">
            <p className="text-sm">
              This will remove <strong>{getVideosForPeriod(selectedPeriod).toLocaleString()}</strong> videos
              older than {selectedPeriod === 6 ? '6 months' : selectedPeriod === 12 ? '1 year' : '2 years'}.
            </p>

            {confirmDelete?.type === 'date' ? (
              <div className="flex gap-2">
                <button
                  onClick={handleDateCleanup}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {deleting && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete({ type: 'date' })}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
              >
                Remove Videos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Channels by Size */}
      <div className="pt-4 border-t space-y-4">
        <h3 className="text-sm font-medium">Channels by Size</h3>
        <p className="text-xs text-muted-foreground">
          Remove all videos from a channel. The channel subscription remains, you can re-sync later.
        </p>

        <div className="space-y-2">
          {displayedChannels.map((channel) => (
            <div
              key={channel.channel_id}
              className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                {channel.thumbnail ? (
                  <img
                    src={channel.thumbnail}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{channel.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {channel.video_count.toLocaleString()} videos
                  </div>
                </div>
              </div>

              {confirmDelete?.type === 'channel' && confirmDelete.id === channel.channel_id ? (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {confirmDelete.months === undefined ? (
                    // Step 1: Choose what to delete
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setConfirmDelete({ type: 'channel', id: channel.channel_id, months: 0 })}
                        className="px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        All
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ type: 'channel', id: channel.channel_id, months: 6 })}
                        className="px-2 py-1 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80"
                      >
                        &gt;6mo
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ type: 'channel', id: channel.channel_id, months: 12 })}
                        className="px-2 py-1 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80"
                      >
                        &gt;1yr
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ type: 'channel', id: channel.channel_id, months: 24 })}
                        className="px-2 py-1 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80"
                      >
                        &gt;2yr
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 rounded-lg text-muted-foreground text-xs hover:bg-muted"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    // Step 2: Confirm deletion
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleChannelRemove(channel.channel_id, confirmDelete.months || undefined)}
                        disabled={deletingChannel === channel.channel_id}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {deletingChannel === channel.channel_id && (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        )}
                        {confirmDelete.months === 0 ? 'Delete All' : `Delete >${confirmDelete.months === 6 ? '6mo' : confirmDelete.months === 12 ? '1yr' : '2yr'}`}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-3 py-1.5 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete({ type: 'channel', id: channel.channel_id })}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {stats.channelsBySize.length > 10 && (
          <button
            onClick={() => setShowAllChannels(!showAllChannels)}
            className="text-sm text-accent hover:underline"
          >
            {showAllChannels
              ? 'Show less'
              : `Show all ${stats.channelsBySize.length} channels`}
          </button>
        )}
      </div>
    </div>
  )
}
