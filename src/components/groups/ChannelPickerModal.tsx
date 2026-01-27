'use client'

import { useState, useEffect } from 'react'
import { WaveformIcon } from './EditGroupModal'

type Channel = {
  id: string
  youtube_id: string
  title: string
  thumbnail: string | null
}

type Group = {
  id: string
  name: string
  icon: string
  color: string
  channel_count: number
}

type ChannelPickerModalProps = {
  group: Group
  onClose: () => void
  onSave: (count: number) => void
}

export default function ChannelPickerModal({ group, onClose, onSave }: ChannelPickerModalProps) {
  const [allChannels, setAllChannels] = useState<Channel[]>([])
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Filter channels based on search
  const filteredChannels = search.trim()
    ? allChannels.filter(c =>
        c.title.toLowerCase().includes(search.toLowerCase())
      )
    : allChannels

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all user's channels and group's channels in parallel
      const [allRes, groupRes] = await Promise.all([
        fetch('/api/channels'),
        fetch(`/api/groups/${group.id}/channels`),
      ])

      if (!allRes.ok) {
        const data = await allRes.json()
        setError(data.error || 'Failed to fetch channels')
        return
      }

      const { channels } = await allRes.json()
      setAllChannels(channels || [])

      if (groupRes.ok) {
        const { channels: groupChannels } = await groupRes.json()
        setSelectedChannelIds(new Set((groupChannels || []).map((c: Channel) => c.id)))
      }
    } catch (err) {
      console.error('Failed to load channels:', err)
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds(prev => {
      const next = new Set(prev)
      if (next.has(channelId)) {
        next.delete(channelId)
      } else {
        next.add(channelId)
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      const res = await fetch(`/api/groups/${group.id}/channels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: Array.from(selectedChannelIds) }),
      })

      if (res.ok) {
        onSave(selectedChannelIds.size)
      }
    } catch (error) {
      console.error('Failed to save channels:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] shadow-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: `${group.color}70` }}
            >
              {group.icon === 'waveform' ? <WaveformIcon className="w-5 h-5" /> : group.icon}
            </div>
            <div>
              <h2 className="font-semibold">{group.name}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedChannelIds.size} channel{selectedChannelIds.size !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-accent/50"
              autoFocus
            />
          </div>
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent border-t-transparent" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-2">{error}</p>
              <button
                onClick={loadChannels}
                className="text-sm text-accent hover:underline"
              >
                Try again
              </button>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {search ? 'No channels found' : 'No channels available'}
              </p>
              {!search && (
                <p className="text-sm text-muted-foreground mt-1">
                  Subscribe to YouTube channels first
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => toggleChannel(channel.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    selectedChannelIds.has(channel.id)
                      ? 'bg-accent/10'
                      : 'hover:bg-muted'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedChannelIds.has(channel.id)
                        ? 'bg-accent border-accent'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    {selectedChannelIds.has(channel.id) && (
                      <CheckIcon className="w-3 h-3 text-white" />
                    )}
                  </div>

                  {/* Thumbnail */}
                  {channel.thumbnail ? (
                    <img
                      src={channel.thumbnail}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-sm">📺</span>
                    </div>
                  )}

                  {/* Title */}
                  <span className="text-sm truncate text-left flex-1 font-medium">
                    {channel.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t shrink-0">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-11 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
