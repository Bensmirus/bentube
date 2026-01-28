'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { WaveformIcon } from './groups/EditGroupModal'

export type Group = {
  id: string
  name: string
  color: string
  icon: string
  channel_count: number
}

type SidebarLockMode = 'auto' | 'open' | 'closed'

type GroupSidebarProps = {
  groups: Group[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onCreateGroup?: () => void
  onReorderGroups?: (groupIds: string[]) => void
}

export default function GroupSidebar({
  groups,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onReorderGroups,
}: GroupSidebarProps) {
  const [lockMode, setLockMode] = useState<SidebarLockMode>('auto')
  const [showDropdown, setShowDropdown] = useState(false)
  const [coloredIcons, setColoredIcons] = useState(true)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load saved preferences
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-lock-mode') as SidebarLockMode | null
    if (saved && ['auto', 'open', 'closed'].includes(saved)) {
      setLockMode(saved)
    }

    const savedColoredIcons = localStorage.getItem('colored-sidebar-icons')
    if (savedColoredIcons !== null) {
      setColoredIcons(savedColoredIcons === 'true')
    }
  }, [])

  // Listen for changes from settings
  useEffect(() => {
    const handleColoredIconsChange = (e: CustomEvent<boolean>) => {
      setColoredIcons(e.detail)
    }
    window.addEventListener('colored-icons-change', handleColoredIconsChange as EventListener)
    return () => window.removeEventListener('colored-icons-change', handleColoredIconsChange as EventListener)
  }, [])

  // Save preference
  const handleSetLockMode = (mode: SidebarLockMode) => {
    setLockMode(mode)
    localStorage.setItem('sidebar-lock-mode', mode)
    setShowDropdown(false)
    // Dispatch event so FeedContent adjusts its layout
    window.dispatchEvent(new CustomEvent('sidebar-lock-mode-change', { detail: mode }))
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  // Determine sidebar width classes based on lock mode
  const isExpanded = lockMode === 'open'
  const isCollapsed = lockMode === 'closed'
  const isAuto = lockMode === 'auto'

  return (
    <aside
      className={cn(
        "group/sidebar fixed left-0 top-0 bottom-16 z-[110] hidden md:flex flex-col border-r transition-all duration-200 bg-[#fffcf5] dark:bg-[#1a1510] isolate",
        isExpanded && "w-[240px]",
        isCollapsed && "w-[72px]",
        isAuto && "w-[72px] hover:w-[240px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-14 border-b overflow-hidden transition-all duration-200",
        isExpanded ? "justify-start px-4" : "justify-center px-0",
        isAuto && "justify-center group-hover/sidebar:justify-start px-0 group-hover/sidebar:px-4"
      )}>
        <span className="text-xl font-bold font-mono text-accent">B.</span>
        <span className={cn(
          "text-xl font-bold font-mono whitespace-nowrap",
          isExpanded ? "inline" : "hidden",
          isAuto && "hidden group-hover/sidebar:inline"
        )}>Tube</span>
      </div>

      {/* Lock Mode Button */}
      <div className="relative flex justify-center py-2" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={`Sidebar: ${lockMode === 'auto' ? 'Auto' : lockMode === 'open' ? 'Locked Open' : 'Locked Closed'}`}
        >
          <LockIcon mode={lockMode} className="w-4 h-4" />
        </button>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute left-2 top-full mt-1 bg-[#fffcf5] dark:bg-[#1a1510] border rounded-lg shadow-lg py-1 min-w-[140px] z-50">
            <button
              onClick={() => handleSetLockMode('auto')}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                lockMode === 'auto' && "text-accent font-medium"
              )}
            >
              <AutoIcon className="w-4 h-4" />
              Auto
            </button>
            <button
              onClick={() => handleSetLockMode('open')}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                lockMode === 'open' && "text-accent font-medium"
              )}
            >
              <PanelLeftOpenIcon className="w-4 h-4" />
              Open
            </button>
            <button
              onClick={() => handleSetLockMode('closed')}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                lockMode === 'closed' && "text-accent font-medium"
              )}
            >
              <PanelLeftCloseIcon className="w-4 h-4" />
              Closed
            </button>
          </div>
        )}
      </div>

      {/* Groups list */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2">
        {/* All Videos */}
        <button
          onClick={() => onSelectGroup(null)}
          className={cn(
            'w-full flex items-center rounded-lg transition-all h-12',
            isExpanded ? 'justify-start px-3' : 'justify-center px-0',
            isAuto && 'justify-center group-hover/sidebar:justify-start px-0 group-hover/sidebar:px-3',
            selectedGroupId === null
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-muted'
          )}
        >
          <span className={cn(
            "text-xl shrink-0",
            isExpanded ? "w-auto text-left" : "w-12 text-center",
            isAuto && "w-12 text-center group-hover/sidebar:w-auto group-hover/sidebar:text-left"
          )}>🎬</span>
          <span className={cn(
            "text-sm font-medium whitespace-nowrap flex-1 text-left ml-2",
            isExpanded ? "block" : "hidden",
            isAuto && "hidden group-hover/sidebar:block"
          )}>
            All
          </span>
        </button>

        {/* Divider */}
        <div className="my-2 mx-3 border-t" />

        {/* Group items */}
        {groups.map((group) => (
          <button
            key={group.id}
            draggable={!!onReorderGroups}
            onDragStart={(e) => {
              setDraggedId(group.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', group.id)
            }}
            onDragEnd={() => {
              setDraggedId(null)
              setDragOverId(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              if (draggedId && draggedId !== group.id) {
                setDragOverId(group.id)
              }
            }}
            onDragLeave={() => {
              setDragOverId(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggedId && draggedId !== group.id && onReorderGroups) {
                const draggedIndex = groups.findIndex((g) => g.id === draggedId)
                const dropIndex = groups.findIndex((g) => g.id === group.id)
                if (draggedIndex !== -1 && dropIndex !== -1) {
                  const newGroups = [...groups]
                  const [removed] = newGroups.splice(draggedIndex, 1)
                  newGroups.splice(dropIndex, 0, removed)
                  onReorderGroups(newGroups.map((g) => g.id))
                }
              }
              setDraggedId(null)
              setDragOverId(null)
            }}
            onClick={() => onSelectGroup(group.id)}
            className={cn(
              'w-full flex items-center rounded-lg transition-all mb-1 h-12',
              isExpanded ? 'justify-start px-3' : 'justify-center px-0',
              isAuto && 'justify-center group-hover/sidebar:justify-start px-0 group-hover/sidebar:px-3',
              // For colored icons: don't use bg-accent, just hover state. For non-colored: keep original behavior
              selectedGroupId === group.id
                ? (coloredIcons ? '' : 'bg-accent text-accent-foreground')
                : 'hover:bg-muted',
              draggedId === group.id && 'opacity-50',
              dragOverId === group.id && 'border-2 border-accent border-dashed',
              onReorderGroups && 'cursor-grab active:cursor-grabbing'
            )}
          >
            {coloredIcons ? (
              <span
                className={cn(
                  "shrink-0 rounded-lg flex items-center justify-center transition-all",
                  isExpanded ? "" : "mx-auto",
                  isAuto && "mx-auto group-hover/sidebar:mx-0",
                  // When selected: slightly bigger with elegant dark frame
                  selectedGroupId === group.id
                    ? "w-10 h-10 text-xl ring-2 ring-neutral-800 dark:ring-neutral-200 ring-offset-1 ring-offset-[#fffcf5] dark:ring-offset-[#1a1510]"
                    : "w-9 h-9 text-lg"
                )}
                style={{
                  backgroundColor: selectedGroupId === group.id
                    ? `${group.color}60` // Slightly more saturated when selected
                    : `${group.color}40`
                }}
              >
                {group.icon === 'waveform' ? <WaveformIcon className="w-5 h-5" /> : group.icon}
              </span>
            ) : (
              <span className={cn(
                "text-xl shrink-0",
                isExpanded ? "w-auto text-left" : "w-12 text-center",
                isAuto && "w-12 text-center group-hover/sidebar:w-auto group-hover/sidebar:text-left"
              )}>{group.icon === 'waveform' ? <WaveformIcon className="w-5 h-5" /> : group.icon}</span>
            )}
            <span className={cn(
              "text-sm font-medium whitespace-nowrap flex-1 text-left truncate ml-2",
              isExpanded ? "block" : "hidden",
              isAuto && "hidden group-hover/sidebar:block"
            )}>
              {group.name}
            </span>
          </button>
        ))}

        {/* Empty state */}
        {groups.length === 0 && (
          <div className={cn(
            "text-center py-4 px-2",
            isExpanded ? "block" : "hidden",
            isAuto && "hidden group-hover/sidebar:block"
          )}>
            <p className="text-xs text-muted-foreground">No groups yet</p>
          </div>
        )}
      </nav>

      {/* Add group button */}
      {onCreateGroup && (
        <div className="p-2 border-t">
          <button
            onClick={onCreateGroup}
            className={cn(
              'w-full flex items-center rounded-lg transition-all h-12',
              isExpanded ? 'justify-start px-3' : 'justify-center px-0',
              isAuto && 'justify-center group-hover/sidebar:justify-start px-0 group-hover/sidebar:px-3',
              'hover:bg-muted text-muted-foreground hover:text-foreground',
              'border border-dashed border-muted-foreground/30 hover:border-accent'
            )}
          >
            <PlusIcon className={cn(
              "w-5 h-5 shrink-0",
              isExpanded ? "w-5" : "w-12",
              isAuto && "w-12 group-hover/sidebar:w-5"
            )} />
            <span className={cn(
              "text-sm whitespace-nowrap",
              isExpanded ? "block" : "hidden",
              isAuto && "hidden group-hover/sidebar:block"
            )}>
              New Group
            </span>
          </button>
        </div>
      )}
    </aside>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function LockIcon({ mode, className }: { mode: SidebarLockMode; className?: string }) {
  if (mode === 'auto') {
    return <AutoIcon className={className} />
  }
  if (mode === 'open') {
    return <PanelLeftOpenIcon className={className} />
  }
  return <PanelLeftCloseIcon className={className} />
}

function AutoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  )
}

function PanelLeftOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 9l3 3-3 3" />
    </svg>
  )
}

function PanelLeftCloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9l-3 3 3 3" />
    </svg>
  )
}
