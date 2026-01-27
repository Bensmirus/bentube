'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'

type Tag = {
  id: string
  name: string
  group_id: string
}

type TagPopoverProps = {
  videoId: string
  groupId: string
  currentTags: Tag[]
  availableTags: Tag[]
  onClose: () => void
  onUpdateTags: (tags: Tag[]) => void
  position?: { top: number; left: number } | null
}

export default function TagPopover({
  videoId,
  groupId,
  currentTags,
  availableTags,
  onClose,
  onUpdateTags,
  position,
}: TagPopoverProps) {
  const [selectedTagNames, setSelectedTagNames] = useState<Set<string>>(
    new Set(currentTags.map(t => t.name.toLowerCase()))
  )
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        handleSave()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedTagNames])

  const toggleTag = (tagName: string) => {
    setSelectedTagNames(prev => {
      const next = new Set(prev)
      const normalized = tagName.toLowerCase()
      if (next.has(normalized)) {
        next.delete(normalized)
      } else {
        next.add(normalized)
      }
      return next
    })
  }

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      const normalized = inputValue.trim().toLowerCase()
      if (normalized) {
        setSelectedTagNames(prev => new Set([...Array.from(prev), normalized]))
        setInputValue('')
      }
    } else if (e.key === 'Escape') {
      handleSave()
    }
  }

  const handleSave = async () => {
    if (saving) return

    setSaving(true)

    try {
      // Convert selected tag names to array, preserving original case from available tags
      const tagNamesToSave = Array.from(selectedTagNames).map(selectedName => {
        const existingTag = availableTags.find(t => t.name.toLowerCase() === selectedName)
        return existingTag ? existingTag.name : selectedName
      })

      const res = await fetch(`/api/videos/${videoId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          tagNames: tagNamesToSave,
        }),
      })

      if (res.ok) {
        const { tags } = await res.json()
        onUpdateTags(tags)
      }

      onClose()
    } catch (error) {
      console.error('Failed to save tags:', error)
      setSaving(false)
    }
  }

  // Get unique tags (merge available tags with new ones from input)
  const allTagNames = new Set([
    ...availableTags.map(t => t.name.toLowerCase()),
    ...Array.from(selectedTagNames),
  ])

  const sortedTagNames = Array.from(allTagNames).sort()

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
      <p className="text-sm font-medium mb-3">Tag video</p>

      {/* Input for creating new tags */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="Create new tag..."
        className="w-full h-9 px-3 mb-3 rounded-lg border bg-muted/30 text-sm placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-accent/50"
      />

      {/* Available tags */}
      <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
        {sortedTagNames.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Type to create your first tag
          </p>
        ) : (
          sortedTagNames.map((tagName) => {
            const isSelected = selectedTagNames.has(tagName)
            const displayName = availableTags.find(t => t.name.toLowerCase() === tagName)?.name || tagName

            return (
              <button
                key={tagName}
                type="button"
                onClick={() => toggleTag(tagName)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isSelected
                    ? 'bg-accent text-white'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {displayName}
              </button>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      <p className="text-xs text-muted-foreground mt-3">
        Press Enter to add, click outside to save
      </p>
    </div>
  )
}
