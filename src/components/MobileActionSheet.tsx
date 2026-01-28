'use client'

import { useEffect } from 'react'

type MobileActionSheetProps = {
  isOpen: boolean
  onClose: () => void
  video: {
    title: string
    watch_later: boolean
  }
  onToggleWatchLater: () => void
  onTag?: () => void
  onDelete: () => void
}

export default function MobileActionSheet({
  isOpen,
  onClose,
  video,
  onToggleWatchLater,
  onTag,
  onDelete,
}: MobileActionSheetProps) {
  // Close on escape key
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[300] md:hidden"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[301] bg-card rounded-t-2xl shadow-2xl md:hidden animate-slide-up">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Content */}
        <div className="px-4 pb-safe">
          {/* Video title */}
          <h3 className="text-sm font-medium line-clamp-2 mb-4 px-2">
            {video.title}
          </h3>

          {/* Actions */}
          <div className="space-y-1 pb-4">
            <button
              onClick={() => {
                onToggleWatchLater()
                onClose()
              }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-lg hover:bg-muted active:bg-muted transition-colors"
            >
              <span className="text-2xl">⏰</span>
              <span className="flex-1 text-left text-base">
                {video.watch_later ? 'Remove from Watch Later' : 'Add to Watch Later'}
              </span>
            </button>

            {onTag && (
              <button
                onClick={() => {
                  onTag()
                  onClose()
                }}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-lg hover:bg-muted active:bg-muted transition-colors"
              >
                <span className="text-2xl">🏷️</span>
                <span className="flex-1 text-left text-base">Tag video</span>
              </button>
            )}

            <button
              onClick={() => {
                onDelete()
                onClose()
              }}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
            >
              <span className="text-2xl">🗑️</span>
              <span className="flex-1 text-left text-base">Delete video</span>
            </button>
          </div>

          {/* Cancel button */}
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-muted rounded-lg font-medium mb-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
