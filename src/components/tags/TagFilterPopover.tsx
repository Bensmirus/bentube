'use client'

import { useEffect, useRef } from 'react'

type Tag = {
  id: string
  name: string
  group_id: string
}

type TagFilterPopoverProps = {
  availableTags: Tag[]
  selectedTagIds: Set<string>
  onToggleTag: (tagId: string) => void
  onClose: () => void
  position?: { top: number; left: number } | null
}

export default function TagFilterPopover({
  availableTags,
  selectedTagIds,
  onToggleTag,
  onClose,
  position,
}: TagFilterPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

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
      className="w-64 rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] p-4 shadow-2xl"
      style={style}
    >
      <p className="text-sm font-medium mb-3">Filter by tags</p>

      {/* Available tags */}
      <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
        {availableTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tags yet. Tag some videos first.
          </p>
        ) : (
          availableTags.map((tag) => {
            const isSelected = selectedTagIds.has(tag.id)

            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(tag.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isSelected
                    ? 'bg-accent text-white'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {tag.name}
              </button>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      {selectedTagIds.size > 1 && (
        <p className="text-xs text-muted-foreground mt-3">
          Showing videos with ALL selected tags
        </p>
      )}
    </div>
  )
}
