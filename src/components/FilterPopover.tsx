'use client'

import { useEffect, useRef, useState } from 'react'

export type DateFilter = 'any' | 'today' | 'week' | 'month' | 'year'
export type DurationFilter = 'any' | 'short' | 'medium' | 'long'

export type FilterState = {
  dateFilter: DateFilter
  durationFilter: DurationFilter
  selectedChannelIds: Set<string>
}

type Channel = {
  id: string
  title: string
  thumbnail: string | null
}

type FilterPopoverProps = {
  filters: FilterState
  channels: Channel[]
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
  onFilterChange,
  onClose,
  position,
}: FilterPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [localFilters, setLocalFilters] = useState<FilterState>(filters)

  // Sync local state when props change
  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

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

  const handleChannelToggle = (channelId: string) => {
    const newSelected = new Set(localFilters.selectedChannelIds)
    if (newSelected.has(channelId)) {
      newSelected.delete(channelId)
    } else {
      newSelected.add(channelId)
    }
    const newFilters = { ...localFilters, selectedChannelIds: newSelected }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleSelectAllChannels = () => {
    const newFilters = {
      ...localFilters,
      selectedChannelIds: new Set<string>(),
    }
    setLocalFilters(newFilters)
    onFilterChange(newFilters)
  }

  const handleClearFilters = () => {
    const clearedFilters: FilterState = {
      dateFilter: 'any',
      durationFilter: 'any',
      selectedChannelIds: new Set(),
    }
    setLocalFilters(clearedFilters)
    onFilterChange(clearedFilters)
  }

  const hasActiveFilters =
    localFilters.dateFilter !== 'any' ||
    localFilters.durationFilter !== 'any' ||
    localFilters.selectedChannelIds.size > 0

  // Calculate position
  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 300,
      }
    : {}

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
              {localFilters.selectedChannelIds.size > 0 && (
                <button
                  onClick={handleSelectAllChannels}
                  className="text-xs text-accent hover:text-accent/80"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {channels.map((channel) => {
                const isSelected = localFilters.selectedChannelIds.size === 0 ||
                  localFilters.selectedChannelIds.has(channel.id)
                const isFiltering = localFilters.selectedChannelIds.size > 0

                return (
                  <button
                    key={channel.id}
                    onClick={() => handleChannelToggle(channel.id)}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-all ${
                      isFiltering && isSelected
                        ? 'bg-accent/10 border border-accent/30'
                        : isFiltering && !isSelected
                        ? 'opacity-50 hover:opacity-75'
                        : 'hover:bg-muted'
                    }`}
                  >
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
                    {isFiltering && isSelected && (
                      <CheckIcon className="w-4 h-4 text-accent flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
            {localFilters.selectedChannelIds.size > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {localFilters.selectedChannelIds.size} channel{localFilters.selectedChannelIds.size !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

// Helper to get filter params for API
export function getFilterParams(filters: FilterState): {
  minDate?: string
  maxDate?: string
  minDuration?: number
  maxDuration?: number
  channelIds?: string[]
} {
  const params: {
    minDate?: string
    maxDate?: string
    minDuration?: number
    maxDuration?: number
    channelIds?: string[]
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

  // Channel filter
  if (filters.selectedChannelIds.size > 0) {
    params.channelIds = Array.from(filters.selectedChannelIds)
  }

  return params
}
