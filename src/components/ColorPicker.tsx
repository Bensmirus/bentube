'use client'

import { useState, useEffect, useRef } from 'react'

const COLORS = [
  // Row 1 - Vibrant
  { value: '#ef4444', name: 'Red' },
  { value: '#f97316', name: 'Orange' },
  { value: '#eab308', name: 'Yellow' },
  { value: '#22c55e', name: 'Green' },
  { value: '#14b8a6', name: 'Teal' },
  { value: '#3b82f6', name: 'Blue' },
  { value: '#8b5cf6', name: 'Purple' },
  { value: '#ec4899', name: 'Pink' },
  // Row 2 - Muted
  { value: '#dc2626', name: 'Dark Red' },
  { value: '#ea580c', name: 'Dark Orange' },
  { value: '#ca8a04', name: 'Dark Yellow' },
  { value: '#16a34a', name: 'Dark Green' },
  { value: '#0d9488', name: 'Dark Teal' },
  { value: '#2563eb', name: 'Dark Blue' },
  { value: '#7c3aed', name: 'Dark Purple' },
  { value: '#db2777', name: 'Dark Pink' },
  // Row 3 - Pastels
  { value: '#fca5a5', name: 'Light Red' },
  { value: '#fdba74', name: 'Light Orange' },
  { value: '#fde047', name: 'Light Yellow' },
  { value: '#86efac', name: 'Light Green' },
  { value: '#5eead4', name: 'Light Teal' },
  { value: '#93c5fd', name: 'Light Blue' },
  { value: '#c4b5fd', name: 'Light Purple' },
  { value: '#f9a8d4', name: 'Light Pink' },
  // Row 4 - Neutrals
  { value: '#78716c', name: 'Stone' },
  { value: '#71717a', name: 'Zinc' },
  { value: '#6b7280', name: 'Gray' },
  { value: '#64748b', name: 'Slate' },
  { value: '#1e293b', name: 'Dark Slate' },
  { value: '#0f172a', name: 'Navy' },
  { value: '#18181b', name: 'Black' },
  { value: '#fafaf9', name: 'White' },
]

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const handleSelect = (color: string) => {
    onChange(color)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-xl border-2 border-dashed border-border hover:border-accent transition-colors overflow-hidden"
      >
        <div
          className="w-full h-full"
          style={{ backgroundColor: value || '#3b82f6' }}
        />
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-[#ffffff] dark:bg-[#262017] border rounded-xl shadow-xl z-[200] p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Choose a color
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => handleSelect(color.value)}
                className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${
                  value === color.value ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>

          {/* Custom color input */}
          <div className="mt-3 pt-3 border-t flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Custom:</span>
            <input
              type="color"
              value={value || '#3b82f6'}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              type="text"
              value={value || '#3b82f6'}
              onChange={(e) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                  handleSelect(e.target.value)
                }
              }}
              placeholder="#3b82f6"
              className="flex-1 h-8 px-2 rounded border bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
      )}
    </div>
  )
}
