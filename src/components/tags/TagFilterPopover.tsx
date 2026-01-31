'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

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
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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

  // Calculate position for desktop
  const style: React.CSSProperties = !isMobile && position
    ? {
        position: 'fixed',
        top: position.top,
        left: Math.min(position.left, window.innerWidth - 280), // Prevent overflow
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
            <span className="text-base font-semibold">Filter by tags</span>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-muted-foreground hover:text-foreground"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 pb-safe">
            {/* Available tags */}
            <div className="flex flex-wrap gap-2 max-h-[50vh] overflow-y-auto">
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
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
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
              <p className="text-sm text-muted-foreground mt-4">
                Showing videos with ALL selected tags
              </p>
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
