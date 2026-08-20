'use client'

import { useState, useEffect, useRef } from 'react'

type Channel = {
  id: string
  youtube_id: string
  title: string
  thumbnail: string | null
}

type AddedChannel = Channel

type Playlist = {
  id: string
  youtube_playlist_id: string
  title: string
  thumbnail: string | null
}

// Combined type for display list
type ListItem = {
  id: string
  title: string
  thumbnail: string | null
  type: 'channel' | 'playlist'
}

type Group = {
  id: string
  name: string
  icon: string
  color: string
  channel_count: number
  video_count?: number
}

type EditGroupModalProps = {
  group: Group | null
  onClose: () => void
  onSave: (data: { name: string; icon: string; color: string }) => Promise<void>
  onSaveChannels: (count: number) => void
  onAddChannel?: () => void
  addedChannel?: AddedChannel | null
  isChildModalOpen?: boolean
}

// Curated list of popular icons with search keywords
const ICONS_DATA = [
  { emoji: '📺', keywords: ['tv', 'television', 'media', 'watch'] },
  { emoji: '🎬', keywords: ['movie', 'film', 'cinema', 'media'] },
  { emoji: '🎥', keywords: ['camera', 'video', 'film', 'movie'] },
  { emoji: '📽️', keywords: ['projector', 'film', 'movie', 'cinema'] },
  { emoji: '🎮', keywords: ['gaming', 'game', 'video game', 'controller'] },
  { emoji: '🕹️', keywords: ['joystick', 'gaming', 'arcade', 'game'] },
  { emoji: '🎵', keywords: ['music', 'song', 'audio', 'note'] },
  { emoji: '🎧', keywords: ['headphones', 'music', 'audio', 'listen'] },
  { emoji: '🎛️', keywords: ['dj', 'controller', 'mixer', 'music', 'audio'] },
  { emoji: '🔊', keywords: ['speaker', 'audio', 'sound', 'volume'] },
  { emoji: '🎚️', keywords: ['slider', 'audio', 'level', 'mixer', 'equalizer'] },
  { emoji: 'waveform', keywords: ['waveform', 'audio', 'daw', 'sound', 'music', 'edit', 'wave'] },
  { emoji: '📚', keywords: ['books', 'reading', 'learning', 'study'] },
  { emoji: '💻', keywords: ['laptop', 'computer', 'tech', 'coding'] },
  { emoji: '🎯', keywords: ['target', 'goal', 'focus', 'aim'] },
  { emoji: '🏆', keywords: ['trophy', 'winner', 'champion', 'award'] },
  { emoji: '⚡', keywords: ['lightning', 'energy', 'power', 'fast'] },
  { emoji: '💡', keywords: ['idea', 'light', 'bulb', 'innovation'] },
  { emoji: '🔧', keywords: ['tool', 'wrench', 'fix', 'repair'] },
  { emoji: '🚀', keywords: ['rocket', 'space', 'launch', 'startup'] },
  { emoji: '🌍', keywords: ['world', 'earth', 'globe', 'travel'] },
  { emoji: '☕', keywords: ['coffee', 'cafe', 'drink', 'morning'] },
  { emoji: '🎸', keywords: ['guitar', 'music', 'rock', 'instrument'] },
  { emoji: '🎹', keywords: ['piano', 'keyboard', 'music', 'instrument'] },
  { emoji: '🎲', keywords: ['dice', 'game', 'board game', 'random'] },
  { emoji: '👾', keywords: ['alien', 'space invader', 'gaming', 'retro'] },
  { emoji: '🤖', keywords: ['robot', 'ai', 'tech', 'automation'] },
  { emoji: '📱', keywords: ['phone', 'mobile', 'smartphone', 'app'] },
  { emoji: '🏠', keywords: ['home', 'house', 'lifestyle', 'living'] },
  { emoji: '🍳', keywords: ['cooking', 'food', 'kitchen', 'breakfast'] },
  { emoji: '⚽', keywords: ['soccer', 'football', 'sports', 'ball'] },
  { emoji: '🏀', keywords: ['basketball', 'sports', 'ball', 'nba'] },
  { emoji: '🎾', keywords: ['tennis', 'sports', 'ball', 'racket'] },
  { emoji: '🏋️', keywords: ['gym', 'fitness', 'workout', 'exercise'] },
  { emoji: '🧘', keywords: ['yoga', 'meditation', 'wellness', 'zen'] },
  { emoji: '🚴', keywords: ['cycling', 'bike', 'sports', 'exercise'] },
  { emoji: '✈️', keywords: ['plane', 'travel', 'flight', 'vacation'] },
  { emoji: '🏔️', keywords: ['mountain', 'nature', 'hiking', 'outdoor'] },
  { emoji: '🎓', keywords: ['graduation', 'education', 'school', 'learning'] },
  { emoji: '✏️', keywords: ['pencil', 'write', 'draw', 'school'] },
  { emoji: '🔬', keywords: ['microscope', 'science', 'research', 'lab'] },
  { emoji: '🧪', keywords: ['chemistry', 'science', 'experiment', 'lab'] },
  { emoji: '🧠', keywords: ['brain', 'mind', 'thinking', 'psychology'] },
  { emoji: '📖', keywords: ['book', 'reading', 'story', 'open book'] },
  { emoji: '🎤', keywords: ['microphone', 'singing', 'podcast', 'karaoke'] },
  { emoji: '🎞️', keywords: ['film', 'frames', 'movie', 'cinema'] },
  { emoji: '📻', keywords: ['radio', 'audio', 'broadcast', 'music'] },
  { emoji: '🛠️', keywords: ['tools', 'diy', 'repair', 'build'] },
  { emoji: '🪴', keywords: ['plant', 'garden', 'nature', 'green'] },
  { emoji: '🛒', keywords: ['shopping', 'cart', 'store', 'buy'] },
  { emoji: '🏖️', keywords: ['beach', 'vacation', 'summer', 'relax'] },
  { emoji: '⛵', keywords: ['sailboat', 'sailing', 'ocean', 'boat'] },
  { emoji: '🦷', keywords: ['tooth', 'teeth', 'dental', 'dentist'] },
  { emoji: '🩺', keywords: ['medical', 'health', 'doctor', 'stethoscope'] },
  { emoji: '🧬', keywords: ['dna', 'genetics', 'science', 'biology'] },
  { emoji: '🔭', keywords: ['telescope', 'astronomy', 'space', 'science'] },
  { emoji: '⚗️', keywords: ['alchemy', 'chemistry', 'science', 'potion'] },
  { emoji: '🧲', keywords: ['magnet', 'physics', 'science', 'attraction'] },
  { emoji: '💊', keywords: ['pill', 'medicine', 'health', 'pharmacy'] },
  { emoji: '🩻', keywords: ['xray', 'medical', 'bones', 'health'] },
  { emoji: '💰', keywords: ['money', 'cash', 'finance', 'wealth'] },
  { emoji: '💵', keywords: ['dollar', 'money', 'cash', 'bills'] },
  { emoji: '💳', keywords: ['credit card', 'money', 'payment', 'finance'] },
  { emoji: '📈', keywords: ['chart', 'stocks', 'growth', 'finance', 'investing'] },
  { emoji: '🏦', keywords: ['bank', 'money', 'finance', 'savings'] },
  { emoji: '💎', keywords: ['diamond', 'gem', 'wealth', 'luxury'] },
  { emoji: '🎨', keywords: ['art', 'painting', 'color', 'palette', 'creative'] },
  { emoji: '🖌️', keywords: ['brush', 'painting', 'art', 'draw'] },
  { emoji: '✨', keywords: ['sparkle', 'magic', 'stars', 'special'] },
]

// Color palette - organized by hue, each row goes from rich to pastel
const COLORS = [
  // Row 1: Reds (dark to light)
  '#8B0000', '#C0392B', '#E74C3C', '#E57373', '#EF9A9A', '#FFCDD2', '#FFEBEE', '#FFF5F5',
  // Row 2: Pinks (dark to light)
  '#880E4F', '#AD1457', '#E91E63', '#F06292', '#F48FB1', '#F8BBD9', '#FCE4EC', '#FFF0F5',
  // Row 3: Oranges (dark to light)
  '#BF360C', '#D35400', '#E67E22', '#FF9800', '#FFB74D', '#FFCC80', '#FFE0B2', '#FFF3E0',
  // Row 4: Yellows (dark to light)
  '#F57F17', '#F9A825', '#FBC02D', '#FFEB3B', '#FFF176', '#FFF59D', '#FFF9C4', '#FFFDE7',
  // Row 5: Greens (dark to light)
  '#1B5E20', '#2E7D32', '#43A047', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9', '#E8F5E9',
  // Row 6: Teals (dark to light)
  '#004D40', '#00695C', '#00897B', '#26A69A', '#4DB6AC', '#80CBC4', '#B2DFDB', '#E0F2F1',
  // Row 7: Blues (dark to light)
  '#0D47A1', '#1565C0', '#1976D2', '#2196F3', '#64B5F6', '#90CAF9', '#BBDEFB', '#E3F2FD',
  // Row 8: Purples (dark to light)
  '#4A148C', '#6A1B9A', '#8E24AA', '#AB47BC', '#BA68C8', '#CE93D8', '#E1BEE7', '#F3E5F5',
  // Row 9: Browns (dark to light)
  '#3E2723', '#4E342E', '#5D4037', '#6D4C41', '#8D6E63', '#A1887F', '#BCAAA4', '#D7CCC8',
  // Row 10: Grays (dark to light)
  '#212121', '#424242', '#616161', '#757575', '#9E9E9E', '#BDBDBD', '#E0E0E0', '#F5F5F5',
]

export default function EditGroupModal({
  group,
  onClose,
  onSave,
  onSaveChannels,
  onAddChannel,
  addedChannel = null,
  isChildModalOpen = false,
}: EditGroupModalProps) {
  const [name, setName] = useState(group?.name || '')
  const [icon, setIcon] = useState(group?.icon || '📺')
  const [color, setColor] = useState(group?.color || '#C19A6B')
  const [saving, setSaving] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [iconSearch, setIconSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Channel picker state
  const [allChannels, setAllChannels] = useState<Channel[]>([])
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set())
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [channelsSaving, setChannelsSaving] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)

  // Playlist picker state
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set())

  const isEditing = !!group

  // Filter icons based on search
  const filteredIcons = iconSearch.trim()
    ? ICONS_DATA.filter(({ keywords }) =>
        keywords.some(k => k.toLowerCase().includes(iconSearch.toLowerCase()))
      )
    : ICONS_DATA

  // Combine channels and playlists into a single list
  const allItems: ListItem[] = [
    ...allChannels.map(c => ({ id: c.id, title: c.title, thumbnail: c.thumbnail, type: 'channel' as const })),
    ...allPlaylists.map(p => ({ id: p.id, title: p.title, thumbnail: p.thumbnail, type: 'playlist' as const })),
  ]

  // Filter and sort items alphabetically
  const filteredItems = (channelSearch.trim()
    ? allItems.filter(item =>
        item.title.toLowerCase().includes(channelSearch.toLowerCase())
      )
    : allItems
  )
    .filter(item => {
      if (!showSelectedOnly) return true
      return item.type === 'channel'
        ? selectedChannelIds.has(item.id)
        : selectedPlaylistIds.has(item.id)
    })
    .sort((a, b) => a.title.localeCompare(b.title))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (group) {
      loadChannels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id])

  useEffect(() => {
    if (!addedChannel) return

    setAllChannels(previous => (
      previous.some(channel => channel.id === addedChannel.id)
        ? previous
        : [...previous, addedChannel]
    ))
    setSelectedChannelIds(previous => {
      const next = new Set(previous)
      next.add(addedChannel.id)
      return next
    })
  }, [addedChannel])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showIconPicker && !showColorPicker && !isChildModalOpen) onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose, showIconPicker, showColorPicker, isChildModalOpen])

  const loadChannels = async () => {
    if (!group) return

    setChannelsLoading(true)
    setChannelsError(null)

    try {
      // Fetch all user's channels, playlists, and group's selections in parallel
      const [allChannelsRes, allPlaylistsRes, groupChannelsRes, groupPlaylistsRes] = await Promise.all([
        fetch('/api/channels'),
        fetch('/api/playlists'),
        fetch(`/api/groups/${group.id}/channels`),
        fetch(`/api/groups/${group.id}/playlists`),
      ])

      if (!allChannelsRes.ok) {
        const data = await allChannelsRes.json()
        setChannelsError(data.error || 'Failed to fetch channels')
        return
      }

      const { channels } = await allChannelsRes.json()
      setAllChannels(channels || [])

      if (allPlaylistsRes.ok) {
        const { playlists } = await allPlaylistsRes.json()
        setAllPlaylists(playlists || [])
      }

      if (groupChannelsRes.ok) {
        const { channels: groupChannels } = await groupChannelsRes.json()
        setSelectedChannelIds(new Set((groupChannels || []).map((c: Channel) => c.id)))
      }

      if (groupPlaylistsRes.ok) {
        const { playlists: groupPlaylists } = await groupPlaylistsRes.json()
        setSelectedPlaylistIds(new Set((groupPlaylists || []).map((p: Playlist) => p.id)))
      }
    } catch (err) {
      console.error('Failed to load channels:', err)
      setChannelsError('Network error. Please try again.')
    } finally {
      setChannelsLoading(false)
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

  const togglePlaylist = (playlistId: string) => {
    setSelectedPlaylistIds(prev => {
      const next = new Set(prev)
      if (next.has(playlistId)) {
        next.delete(playlistId)
      } else {
        next.add(playlistId)
      }
      return next
    })
  }

  const toggleItem = (item: ListItem) => {
    if (item.type === 'channel') {
      toggleChannel(item.id)
    } else {
      togglePlaylist(item.id)
    }
  }

  const isItemSelected = (item: ListItem) => {
    return item.type === 'channel'
      ? selectedChannelIds.has(item.id)
      : selectedPlaylistIds.has(item.id)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)

    try {
      // Save group info
      await onSave({ name: name.trim(), icon, color })

      // Save channels and playlists if editing
      if (group) {
        setChannelsSaving(true)

        // Save channels and playlists in parallel
        const [channelsRes, playlistsRes] = await Promise.all([
          fetch(`/api/groups/${group.id}/channels`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelIds: Array.from(selectedChannelIds) }),
          }),
          fetch(`/api/groups/${group.id}/playlists`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistIds: Array.from(selectedPlaylistIds) }),
          }),
        ])

        if (channelsRes.ok) {
          onSaveChannels(selectedChannelIds.size)
        } else {
          throw new Error('Failed to save channels')
        }

        if (!playlistsRes.ok) {
          throw new Error('Failed to save playlists')
        }
      }
      onClose()
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
      setChannelsSaving(false)
    }
  }

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-lg rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
          <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
            {/* Header - Emoji, Name, Color in one row */}
            <div className="p-4 border-b shrink-0">
              <div className="flex items-center gap-3 mb-4">
                {/* Clickable icon preview */}
                <button
                  type="button"
                  onClick={() => {
                    setShowIconPicker(true)
                    setShowColorPicker(false)
                  }}
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 transition-all hover:scale-105"
                  style={{ backgroundColor: `${color}40` }}
                  title="Click to change icon"
                >
                  {icon === 'waveform' ? <WaveformIcon className="w-6 h-6" /> : icon}
                </button>

                {/* Name input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Group name..."
                  className="flex-1 h-12 px-3 text-base font-medium bg-transparent border rounded-xl outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-accent/50"
                />

                {/* Color button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowColorPicker(true)
                    setShowIconPicker(false)
                  }}
                  className="w-12 h-12 rounded-xl border-2 border-muted/50 transition-all hover:scale-105 shrink-0"
                  style={{ backgroundColor: color }}
                  title="Click to change color"
                />
              </div>

              {/* Only show channel/playlist picker if editing existing group */}
              {group && (
                <>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm text-muted-foreground">
                      {selectedChannelIds.size} channel{selectedChannelIds.size !== 1 ? 's' : ''}
                      {selectedPlaylistIds.size > 0 && (
                        <>, {selectedPlaylistIds.size} playlist{selectedPlaylistIds.size !== 1 ? 's' : ''}</>
                      )}
                    </p>

                    <div className="flex items-center gap-2">
                      {/* Show selected toggle */}
                      <button
                        type="button"
                        onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          showSelectedOnly
                            ? 'bg-accent text-white'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <CheckIcon className="w-3 h-3" />
                        <span>Selected only</span>
                      </button>
                      {onAddChannel && (
                        <button
                          type="button"
                          onClick={onAddChannel}
                          className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/90 transition-colors"
                          aria-label={`Add a channel to ${group.name}`}
                          title="Add channel"
                        >
                          <PlusIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Search bar */}
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={channelSearch}
                      onChange={(e) => setChannelSearch(e.target.value)}
                      placeholder="Search channels and playlists..."
                      className="w-full h-10 pl-9 pr-4 rounded-xl border bg-muted/30 text-sm placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Channel/Playlist list - only show if editing */}
            {group && (
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {channelsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent border-t-transparent" />
                  </div>
                ) : channelsError ? (
                  <div className="text-center py-12">
                    <p className="text-red-500 mb-2">{channelsError}</p>
                    <button
                      type="button"
                      onClick={loadChannels}
                      className="text-sm text-accent hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">
                      {channelSearch ? 'No channels or playlists found' : 'No channels or playlists available'}
                    </p>
                    {!channelSearch && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Subscribe to channels or import playlists first
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredItems.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onClick={() => toggleItem(item)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                          isItemSelected(item)
                            ? 'bg-accent/10'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isItemSelected(item)
                              ? 'bg-accent border-accent'
                              : 'border-muted-foreground/30'
                          }`}
                        >
                          {isItemSelected(item) && (
                            <CheckIcon className="w-3 h-3 text-white" />
                          )}
                        </div>

                        {/* Thumbnail */}
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt=""
                            className={`w-10 h-10 object-cover shrink-0 ${
                              item.type === 'channel' ? 'rounded-full' : 'rounded-lg'
                            }`}
                          />
                        ) : (
                          <div className={`w-10 h-10 bg-muted flex items-center justify-center shrink-0 ${
                            item.type === 'channel' ? 'rounded-full' : 'rounded-lg'
                          }`}>
                            <span className="text-sm">{item.type === 'channel' ? '📺' : '📋'}</span>
                          </div>
                        )}

                        {/* Title and type badge */}
                        <div className="flex-1 min-w-0 text-left">
                          <span className="text-sm truncate block font-medium">
                            {item.title}
                          </span>
                          {item.type === 'playlist' && (
                            <span className="text-xs text-muted-foreground">Playlist</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                  type="submit"
                  disabled={!name.trim() || saving || channelsSaving}
                  className="flex-1 h-11 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving || channelsSaving ? 'Saving...' : isEditing ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Icon Picker Popover */}
      {showIconPicker && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowIconPicker(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] p-4 shadow-2xl">
            <p className="text-sm font-medium mb-3">Choose an icon</p>
            {/* Search bar */}
            <input
              type="text"
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Search icons..."
              className="w-full h-9 px-3 mb-3 rounded-lg border bg-muted/30 text-sm placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-accent/50"
              autoFocus
            />
            <div className="grid grid-cols-8 gap-2">
              {filteredIcons.map(({ emoji }) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setIcon(emoji)
                    setShowIconPicker(false)
                    setIconSearch('')
                  }}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                    icon === emoji
                      ? 'bg-accent/20 ring-2 ring-accent'
                      : 'hover:bg-muted'
                  }`}
                >
                  {emoji === 'waveform' ? <WaveformIcon className="w-5 h-5" /> : emoji}
                </button>
              ))}
              {filteredIcons.length === 0 && (
                <p className="col-span-8 text-center text-sm text-muted-foreground py-4">
                  No icons found
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Color Picker Popover */}
      {showColorPicker && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowColorPicker(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] p-4 shadow-2xl">
            <p className="text-sm font-medium mb-3">Choose a color</p>
            <div className="grid grid-cols-8 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c)
                    setShowColorPicker(false)
                  }}
                  className={`w-10 h-10 rounded-lg transition-all ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function WaveformIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="1" y="10" width="2" height="4" rx="0.5" />
      <rect x="4" y="7" width="2" height="10" rx="0.5" />
      <rect x="7" y="4" width="2" height="16" rx="0.5" />
      <rect x="10" y="8" width="2" height="8" rx="0.5" />
      <rect x="13" y="3" width="2" height="18" rx="0.5" />
      <rect x="16" y="6" width="2" height="12" rx="0.5" />
      <rect x="19" y="9" width="2" height="6" rx="0.5" />
      <rect x="22" y="11" width="1" height="2" rx="0.5" />
    </svg>
  )
}

export function renderGroupIcon(icon: string, className?: string) {
  if (icon === 'waveform') {
    return <WaveformIcon className={className} />
  }
  return icon
}
