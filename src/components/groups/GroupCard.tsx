'use client'

import { useState } from 'react'
import { WaveformIcon } from './EditGroupModal'

type Group = {
  id: string
  name: string
  icon: string
  color: string
  channel_count: number
  video_count: number
}

type GroupCardProps = {
  group: Group
  onEdit: () => void
  onDelete: () => void
  onDeleteVideos: () => void
  onSync: () => Promise<void>
}

export default function GroupCard({ group, onEdit, onDelete, onDeleteVideos, onSync }: GroupCardProps) {
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    if (syncing || group.channel_count === 0) return
    setSyncing(true)
    try {
      await onSync()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4 isolate bg-[#ffffff] dark:bg-[#262017] flex items-center gap-4">
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
        style={{ backgroundColor: `${group.color}70` }}
      >
        {group.icon === 'waveform' ? <WaveformIcon className="w-6 h-6" /> : group.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium truncate">{group.name}</h3>
        <p className="text-sm text-muted-foreground">
          {group.channel_count} {group.channel_count === 1 ? 'channel' : 'channels'} · {group.video_count} {group.video_count === 1 ? 'video' : 'videos'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={syncing || group.channel_count === 0}
          className="p-2 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Sync group"
          title={group.channel_count === 0 ? 'Add channels first' : 'Sync this group'}
        >
          {syncing ? (
            <div className="w-5 h-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : (
            <SyncIcon className="w-5 h-5" />
          )}
        </button>
        <button
          onClick={onDeleteVideos}
          disabled={group.video_count === 0}
          className="p-2 rounded-lg text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Delete all videos"
          title={group.video_count === 0 ? 'No videos to delete' : 'Delete all videos in this group'}
        >
          <VideoTrashIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onEdit}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Edit group"
        >
          <EditIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
          aria-label="Delete group"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function VideoTrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h.01M6 15l6-6" />
    </svg>
  )
}
