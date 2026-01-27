'use client'

import { useState, useEffect, useRef, useMemo, useCallback, useTransition } from 'react'

interface Icon {
  emoji: string
  name: string
  category: string
  keywords: string[]
}

interface IconPickerProps {
  value: string
  onChange: (emoji: string) => void
}

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [deferredSearch, setDeferredSearch] = useState('')
  const [icons, setIcons] = useState<Record<string, Icon[]>>({})
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch icons on first open
  useEffect(() => {
    if (isOpen && Object.keys(icons).length === 0) {
      setLoading(true)
      fetch('/api/icons')
        .then(res => res.json())
        .then(data => {
          setIcons(data.icons || {})
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [isOpen, icons])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle search input with deferred update for snappy typing
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearch(value) // Immediate update for input field
    startTransition(() => {
      setDeferredSearch(value) // Deferred update for filtering
    })
  }, [])

  // Memoize filtered icons to prevent recalculation on every render
  const filteredIcons = useMemo(() => {
    return Object.entries(icons).reduce((acc, [category, categoryIcons]) => {
      if (!deferredSearch) {
        acc[category] = categoryIcons
        return acc
      }
      const searchLower = deferredSearch.toLowerCase()
      const filtered = categoryIcons.filter(icon =>
        icon.name.toLowerCase().includes(searchLower) ||
        (Array.isArray(icon.keywords) && icon.keywords.some(k => k.toLowerCase().includes(searchLower)))
      )
      if (filtered.length > 0) {
        acc[category] = filtered
      }
      return acc
    }, {} as Record<string, Icon[]>)
  }, [icons, deferredSearch])

  const handleSelect = (emoji: string) => {
    onChange(emoji)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-xl border-2 border-dashed border-border hover:border-accent bg-background flex items-center justify-center text-3xl transition-colors"
      >
        {value || '📁'}
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-[#ffffff] dark:bg-[#262017] border rounded-xl shadow-xl z-[200] overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search icons..."
                value={search}
                onChange={handleSearchChange}
                className="w-full h-9 pl-9 pr-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                autoFocus
              />
            </div>
          </div>

          {/* Icons grid */}
          <div className="max-h-72 overflow-y-auto p-2">
            {loading || isPending ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : Object.keys(filteredIcons).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No icons found
              </div>
            ) : (
              Object.entries(filteredIcons).map(([category, categoryIcons]) => (
                <div key={category} className="mb-3">
                  <div className="text-xs font-medium text-muted-foreground px-1 mb-1.5">
                    {category}
                  </div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {categoryIcons.map((icon) => (
                      <button
                        key={icon.emoji}
                        type="button"
                        onClick={() => handleSelect(icon.emoji)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-accent/20 transition-colors ${
                          value === icon.emoji ? 'bg-accent/30 ring-2 ring-accent' : ''
                        }`}
                        title={icon.name}
                      >
                        {icon.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
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
