'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { WaveformIcon } from './groups/EditGroupModal'

export type Group = {
  id: string
  name: string
  color: string
  icon: string
  channel_count: number
  video_count: number
}

type GroupDropdownProps = {
  groups: Group[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onCreateGroup?: () => void
}

export default function GroupDropdown({
  groups,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
}: GroupDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Memoize computed values
  const totalVideos = useMemo(() => groups.reduce((acc, g) => acc + g.video_count, 0), [groups])
  const selectedGroup = useMemo(() => groups.find(g => g.id === selectedGroupId), [groups, selectedGroupId])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Memoize handlers
  const handleToggle = useCallback(() => setIsOpen(prev => !prev), [])

  const handleSelect = useCallback((groupId: string | null) => {
    onSelectGroup(groupId)
    setIsOpen(false)
  }, [onSelectGroup])

  const handleCreateClick = useCallback(() => {
    setIsOpen(false)
    onCreateGroup?.()
  }, [onCreateGroup])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown trigger button */}
      <button
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-2.5 px-4 py-2 rounded-lg border transition-all',
          'bg-muted hover:bg-muted',
          isOpen && 'ring-2 ring-accent/30 border-accent'
        )}
      >
        <span className="text-lg">
          {selectedGroup ? selectedGroup.icon : '🎬'}
        </span>
        <span className="text-sm font-medium">
          {selectedGroup ? selectedGroup.name : 'All Videos'}
        </span>
        <ChevronIcon
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown menu - solid background */}
      {isOpen && (
        <div
          className="absolute top-full left-0 mt-2 w-60 border rounded-xl py-2 animate-in fade-in slide-in-from-top-2 duration-150 bg-[#ffffff] dark:bg-[#262017]"
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 200
          }}
        >
          {/* All Videos option */}
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 transition-colors',
              selectedGroupId === null
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-muted'
            )}
          >
            <span className="text-lg">🎬</span>
            <span className="flex-1 text-sm font-medium text-left">All Videos</span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              selectedGroupId === null
                ? 'bg-accent/20 text-accent'
                : 'bg-muted text-muted-foreground'
            )}>
              {totalVideos}
            </span>
          </button>

          {/* Divider */}
          {groups.length > 0 && <div className="my-2 border-t mx-2" />}

          {/* Group items */}
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => handleSelect(group.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 transition-colors',
                selectedGroupId === group.id
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-muted'
              )}
            >
              <span className="text-lg">{group.icon === 'waveform' ? <WaveformIcon className="w-5 h-5" /> : group.icon}</span>
              <span className="flex-1 text-sm font-medium text-left truncate">
                {group.name}
              </span>
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                selectedGroupId === group.id
                  ? 'bg-accent/20 text-accent'
                  : 'bg-muted text-muted-foreground'
              )}>
                {group.video_count}
              </span>
            </button>
          ))}

          {/* Empty state */}
          {groups.length === 0 && (
            <div className="text-center py-4 px-4">
              <p className="text-sm text-muted-foreground">No groups yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first group below
              </p>
            </div>
          )}

          {/* Divider before add button */}
          {onCreateGroup && <div className="my-2 border-t mx-2" />}

          {/* Add group button */}
          {onCreateGroup && (
            <button
              onClick={handleCreateClick}
              className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <span className="w-6 h-6 rounded-md border border-dashed border-current flex items-center justify-center text-sm">
                +
              </span>
              <span className="text-sm">New Group</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
