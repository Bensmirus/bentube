'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export type DateFilter = 'any' | 'today' | 'week' | 'month' | 'year'
export type DurationFilter = 'any' | 'short' | 'medium' | 'long'

export type FilterState = {
  dateFilter: DateFilter
  durationFilter: DurationFilter
  includedChannelIds: Set<string>
  excludedChannelIds: Set<string>
  includedGroupIds: Set<string>
  excludedGroupIds: Set<string>
}

type Channel = {
  id: string
  title: string
  thumbnail: string | null
}

type GroupItem = {
  id: string
  name: string
  icon: string
}

type FilterPopoverProps = {
  filters: FilterState
  channels: Channel[]
  groups?: GroupItem[]
  onFilterChange: (filters: FilterState) => void
  onClose: () => void
  position?: { top: number; left: number } | null
}

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
]

const DURATION_OPTIONS: { value: DurationFilter; label: string; description: string }[] = [
  { value: 'any', label: 'Any', description: 'All videos' },
  { value: 'short', label: 'Short', description: 'Under 5 min' },
  { value: 'medium', label: 'Medium', description: '5-20 min' },
  { value: 'long', label: 'Long', description: 'Over 20 min' },
]

export default function FilterPopover({
  filters,
  channels,
  groups,
  onFilterChange,
  onClose,
  position,
}: FilterPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [localFilters, setLocalFilters] = useState<FilterState>(filters)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Sync local state when props change
  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    // Only add click outside listener for desktop
    if (!isMobile) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, isMobile, handleClickOutside])

  const handleDateChange = (value: DateFilter) => {
    const newFilters = { ...localFilters, dateFilter: value }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleDurationChange = (value: DurationFilter) => {
    const newFilters = { ...localFilters, durationFilter: value }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleIncludeChannel = (channelId: string) => {
    const newIncluded = new Set(localFilters.includedChannelIds)
    const newExcluded = new Set(localFilters.excludedChannelIds)

    // Remove from excluded if present
    newExcluded.delete(channelId)

    // Toggle included
    if (newIncluded.has(channelId)) {
      newIncluded.delete(channelId)
    } else {
      newIncluded.add(channelId)
    }

    const newFilters = {
      ...localFilters,
      includedChannelIds: newIncluded,
      excludedChannelIds: newExcluded
    }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleExcludeChannel = (channelId: string) => {
    const newIncluded = new Set(localFilters.includedChannelIds)
    const newExcluded = new Set(localFilters.excludedChannelIds)

    // Remove from included if present
    newIncluded.delete(channelId)

    // Toggle excluded
    if (newExcluded.has(channelId)) {
      newExcluded.delete(channelId)
    } else {
      newExcluded.add(channelId)
    }

    const newFilters = {
      ...localFilters,
      includedChannelIds: newIncluded,
      excludedChannelIds: newExcluded
    }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleClearChannelFilters = () => {
    const newFilters = {
      ...localFilters,
      includedChannelIds: new Set<string>(),
      excludedChannelIds: new Set<string>(),
    }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleIncludeGroup = (groupId: string) => {
    const newIncluded = new Set(localFilters.includedGroupIds)
    const newExcluded = new Set(localFilters.excludedGroupIds)

    newExcluded.delete(groupId)

    if (newIncluded.has(groupId)) {
      newIncluded.delete(groupId)
    } else {
      newIncluded.add(groupId)
    }

    const newFilters = {
      ...localFilters,
      includedGroupIds: newIncluded,
      excludedGroupIds: newExcluded,
    }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleExcludeGroup = (groupId: string) => {
    const newIncluded = new Set(localFilters.includedGroupIds)
    const newExcluded = new Set(localFilters.excludedGroupIds)

    newIncluded.delete(groupId)

    if (newExcluded.has(groupId)) {
      newExcluded.delete(groupId)
    } else {
      newExcluded.add(groupId)
    }

    const newFilters = {
      ...localFilters,
      includedGroupIds: newIncluded,
      excludedGroupIds: newExcluded,
    }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleClearGroupFilters = () => {
    const newFilters = {
      ...localFilters,
      includedGroupIds: new Set<string>(),
      excludedGroupIds: new Set<string>(),
    }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleClearFilters = () => {
    const clearedFilters: FilterState = {
      dateFilter: 'any',
      durationFilter: 'any',
      includedChannelIds: new Set(),
      excludedChannelIds: new Set(),
      includedGroupIds: new Set(),
      excludedGroupIds: new Set(),
    }
    setLocalFilters(clearedFilters)
    onFilterChange(clearedFilters)
  }

  const hasActiveFilters =
    localFilters.dateFilter !== 'any' ||
    localFilters.durationFilter !== 'any' ||
    localFilters.includedChannelIds.size > 0 ||
    localFilters.excludedChannelIds.size > 0 ||
    localFilters.includedGroupIds.size > 0 ||
    localFilters.excludedGroupIds.size > 0

  // Calculate position for desktop
  const style: React.CSSProperties = !isMobile && position
    ? {
        position: 'fixed',
        top: position.top,
        left: Math.min(position.left, window.innerWidth - 340), // Prevent overflow
        zIndex: 300,
      }
    : {}

  // Mobile: Bottom sheet layout
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-[300]"
          onClick={onClose}
        />
        {/* Bottom sheet */}
        <div
          ref={popoverRef}
          className="fixed bottom-0 left-0 right-0 z-[301] bg-[#ffffff] dark:bg-[#262017] rounded-t-2xl shadow-2xl animate-slide-up"
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-base font-semibold">Filters</span>
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="text-sm text-accent hover:text-accent/80"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-muted-foreground hover:text-foreground"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto pb-safe">
            {/* Date Filter */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Upload date
              </p>
              <div className="flex flex-wrap gap-2">
                {DATE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleDateChange(option.value)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                      localFilters.dateFilter === option.value
                        ? 'bg-accent text-white'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Filter */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Duration
              </p>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleDurationChange(option.value)}
                    title={option.description}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                      localFilters.durationFilter === option.value
                        ? 'bg-accent text-white'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel Filter */}
            {channels.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Channels
                  </p>
                  {(localFilters.includedChannelIds.size > 0 || localFilters.excludedChannelIds.size > 0) && (
                    <button
                      onClick={handleClearChannelFilters}
                      className="text-sm text-accent hover:text-accent/80"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {(localFilters.includedChannelIds.size > 0 || localFilters.excludedChannelIds.size > 0) && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {localFilters.includedChannelIds.size > 0 && `Showing ${localFilters.includedChannelIds.size}`}
                    {localFilters.includedChannelIds.size > 0 && localFilters.excludedChannelIds.size > 0 && ', '}
                    {localFilters.excludedChannelIds.size > 0 && `Hiding ${localFilters.excludedChannelIds.size}`}
                  </p>
                )}
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {channels.map((channel) => {
                    const isIncluded = localFilters.includedChannelIds.has(channel.id)
                    const isExcluded = localFilters.excludedChannelIds.has(channel.id)

                    return (
                      <div
                        key={channel.id}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-all"
                      >
                        {/* Plus button */}
                        <button
                          onClick={() => handleIncludeChannel(channel.id)}
                          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all flex-shrink-0 ${
                            isIncluded
                              ? 'bg-green-500 text-white'
                              : 'bg-muted hover:bg-green-500/20 text-muted-foreground hover:text-green-600'
                          }`}
                          title="Include only this channel"
                        >
                          <span className="text-lg font-bold leading-none">+</span>
                        </button>

                        {/* Minus button */}
                        <button
                          onClick={() => handleExcludeChannel(channel.id)}
                          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all flex-shrink-0 ${
                            isExcluded
                              ? 'bg-red-500 text-white'
                              : 'bg-muted hover:bg-red-500/20 text-muted-foreground hover:text-red-600'
                          }`}
                          title="Exclude this channel"
                        >
                          <span className="text-lg font-bold leading-none">−</span>
                        </button>

                        {channel.thumbnail ? (
                          <img
                            src={channel.thumbnail}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">
                            {channel.title.charAt(0)}
                          </div>
                        )}
                        <span className="text-sm truncate flex-1">{channel.title}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Group Filter (All view only) */}
            {groups && groups.length > 0 && channels.length === 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Groups
                  </p>
                  {(localFilters.includedGroupIds.size > 0 || localFilters.excludedGroupIds.size > 0) && (
                    <button
                      onClick={handleClearGroupFilters}
                      className="text-sm text-accent hover:text-accent/80"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {(localFilters.includedGroupIds.size > 0 || localFilters.excludedGroupIds.size > 0) && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {localFilters.includedGroupIds.size > 0 && `Showing ${localFilters.includedGroupIds.size}`}
                    {localFilters.includedGroupIds.size > 0 && localFilters.excludedGroupIds.size > 0 && ', '}
                    {localFilters.excludedGroupIds.size > 0 && `Hiding ${localFilters.excludedGroupIds.size}`}
                  </p>
                )}
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {groups.map((group) => {
                    const isIncluded = localFilters.includedGroupIds.has(group.id)
                    const isExcluded = localFilters.excludedGroupIds.has(group.id)

                    return (
                      <div
                        key={group.id}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-all"
                      >
                        <button
                          onClick={() => handleIncludeGroup(group.id)}
                          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all flex-shrink-0 ${
                            isIncluded
                              ? 'bg-green-500 text-white'
                              : 'bg-muted hover:bg-green-500/20 text-muted-foreground hover:text-green-600'
                          }`}
                          title="Show only this group"
                        >
                          <span className="text-lg font-bold leading-none">+</span>
                        </button>

                        <button
                          onClick={() => handleExcludeGroup(group.id)}
                          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all flex-shrink-0 ${
                            isExcluded
                              ? 'bg-red-500 text-white'
                              : 'bg-muted hover:bg-red-500/20 text-muted-foreground hover:text-red-600'
                          }`}
                          title="Hide this group"
                        >
                          <span className="text-lg font-bold leading-none">−</span>
                        </button>

                        <span className="text-lg flex-shrink-0">{group.icon}</span>
                        <span className="text-sm truncate flex-1">{group.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  // Desktop: Popover layout
  return (
    <div
      ref={popoverRef}
      className="w-80 rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] shadow-2xl overflow-hidden"
      style={style}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-medium">Filters</span>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs text-accent hover:text-accent/80"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="p-4 space-y-5 max-h-[400px] overflow-y-auto">
        {/* Date Filter */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Upload date
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DATE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleDateChange(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  localFilters.dateFilter === option.value
                    ? 'bg-accent text-white'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration Filter */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Duration
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleDurationChange(option.value)}
                title={option.description}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  localFilters.durationFilter === option.value
                    ? 'bg-accent text-white'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Channel Filter */}
        {channels.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Channels
              </p>
              {(localFilters.includedChannelIds.size > 0 || localFilters.excludedChannelIds.size > 0) && (
                <button
                  onClick={handleClearChannelFilters}
                  className="text-xs text-accent hover:text-accent/80"
                >
                  Clear
                </button>
              )}
            </div>
            {(localFilters.includedChannelIds.size > 0 || localFilters.excludedChannelIds.size > 0) && (
              <p className="text-xs text-muted-foreground mb-2">
                {localFilters.includedChannelIds.size > 0 && `Showing ${localFilters.includedChannelIds.size}`}
                {localFilters.includedChannelIds.size > 0 && localFilters.excludedChannelIds.size > 0 && ', '}
                {localFilters.excludedChannelIds.size > 0 && `Hiding ${localFilters.excludedChannelIds.size}`}
              </p>
            )}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {channels.map((channel) => {
                const isIncluded = localFilters.includedChannelIds.has(channel.id)
                const isExcluded = localFilters.excludedChannelIds.has(channel.id)

                return (
                  <div
                    key={channel.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-all"
                  >
                    {/* Plus button */}
                    <button
                      onClick={() => handleIncludeChannel(channel.id)}
                      className={`w-5 h-5 flex items-center justify-center rounded transition-all flex-shrink-0 ${
                        isIncluded
                          ? 'bg-green-500 text-white'
                          : 'bg-muted hover:bg-green-500/20 text-muted-foreground hover:text-green-600'
                      }`}
                      title="Include only this channel"
                    >
                      <span className="text-sm font-bold leading-none">+</span>
                    </button>

                    {/* Minus button */}
                    <button
                      onClick={() => handleExcludeChannel(channel.id)}
                      className={`w-5 h-5 flex items-center justify-center rounded transition-all flex-shrink-0 ${
                        isExcluded
                          ? 'bg-red-500 text-white'
                          : 'bg-muted hover:bg-red-500/20 text-muted-foreground hover:text-red-600'
                      }`}
                      title="Exclude this channel"
                    >
                      <span className="text-sm font-bold leading-none">−</span>
                    </button>

                    {channel.thumbnail ? (
                      <img
                        src={channel.thumbnail}
                        alt=""
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                        {channel.title.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm truncate flex-1">{channel.title}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Group Filter (All view only) */}
        {groups && groups.length > 0 && channels.length === 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Groups
              </p>
              {(localFilters.includedGroupIds.size > 0 || localFilters.excludedGroupIds.size > 0) && (
                <button
                  onClick={handleClearGroupFilters}
                  className="text-xs text-accent hover:text-accent/80"
                >
                  Clear
                </button>
              )}
            </div>
            {(localFilters.includedGroupIds.size > 0 || localFilters.excludedGroupIds.size > 0) && (
              <p className="text-xs text-muted-foreground mb-2">
                {localFilters.includedGroupIds.size > 0 && `Showing ${localFilters.includedGroupIds.size}`}
                {localFilters.includedGroupIds.size > 0 && localFilters.excludedGroupIds.size > 0 && ', '}
                {localFilters.excludedGroupIds.size > 0 && `Hiding ${localFilters.excludedGroupIds.size}`}
              </p>
            )}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {groups.map((group) => {
                const isIncluded = localFilters.includedGroupIds.has(group.id)
                const isExcluded = localFilters.excludedGroupIds.has(group.id)

                return (
                  <div
                    key={group.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-all"
                  >
                    <button
                      onClick={() => handleIncludeGroup(group.id)}
                      className={`w-5 h-5 flex items-center justify-center rounded transition-all flex-shrink-0 ${
                        isIncluded
                          ? 'bg-green-500 text-white'
                          : 'bg-muted hover:bg-green-500/20 text-muted-foreground hover:text-green-600'
                      }`}
                      title="Show only this group"
                    >
                      <span className="text-sm font-bold leading-none">+</span>
                    </button>

                    <button
                      onClick={() => handleExcludeGroup(group.id)}
                      className={`w-5 h-5 flex items-center justify-center rounded transition-all flex-shrink-0 ${
                        isExcluded
                          ? 'bg-red-500 text-white'
                          : 'bg-muted hover:bg-red-500/20 text-muted-foreground hover:text-red-600'
                      }`}
                      title="Hide this group"
                    >
                      <span className="text-sm font-bold leading-none">−</span>
                    </button>

                    <span className="text-sm flex-shrink-0">{group.icon}</span>
                    <span className="text-sm truncate flex-1">{group.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper to get filter params for API
export function getFilterParams(filters: FilterState): {
  minDate?: string
  maxDate?: string
  minDuration?: number
  maxDuration?: number
  channelIds?: string[]
  excludeChannelIds?: string[]
  includeGroupIds?: string[]
  excludeGroupIds?: string[]
} {
  const params: {
    minDate?: string
    maxDate?: string
    minDuration?: number
    maxDuration?: number
    channelIds?: string[]
    excludeChannelIds?: string[]
    includeGroupIds?: string[]
    excludeGroupIds?: string[]
  } = {}

  // Date filter
  if (filters.dateFilter !== 'any') {
    const now = new Date()
    let minDate: Date

    switch (filters.dateFilter) {
      case 'today':
        minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        minDate = new Date(now)
        minDate.setDate(minDate.getDate() - 7)
        break
      case 'month':
        minDate = new Date(now)
        minDate.setMonth(minDate.getMonth() - 1)
        break
      case 'year':
        minDate = new Date(now)
        minDate.setFullYear(minDate.getFullYear() - 1)
        break
      default:
        minDate = new Date(0)
    }

    params.minDate = minDate.toISOString()
  }

  // Duration filter (in seconds)
  switch (filters.durationFilter) {
    case 'short':
      params.maxDuration = 300 // 5 minutes
      break
    case 'medium':
      params.minDuration = 300 // 5 minutes
      params.maxDuration = 1200 // 20 minutes
      break
    case 'long':
      params.minDuration = 1200 // 20 minutes
      break
  }

  // Channel filters
  if (filters.includedChannelIds.size > 0) {
    params.channelIds = Array.from(filters.includedChannelIds)
  }
  if (filters.excludedChannelIds.size > 0) {
    params.excludeChannelIds = Array.from(filters.excludedChannelIds)
  }

  // Group filters
  if (filters.includedGroupIds.size > 0) {
    params.includeGroupIds = Array.from(filters.includedGroupIds)
  }
  if (filters.excludedGroupIds.size > 0) {
    params.excludeGroupIds = Array.from(filters.excludedGroupIds)
  }

  return params
}
