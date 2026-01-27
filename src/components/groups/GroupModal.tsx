'use client'

import { useState, useEffect, useRef } from 'react'

type Group = {
  id: string
  name: string
  icon: string
  color: string
  channel_count: number
}

type GroupModalProps = {
  group: Group | null
  onClose: () => void
  onSave: (data: { name: string; icon: string; color: string }) => void
}

// Curated list of popular icons with search keywords
const ICONS_DATA = [
  { emoji: '📺', keywords: ['tv', 'television', 'media', 'watch'] },
  { emoji: '🎬', keywords: ['movie', 'film', 'cinema', 'media'] },
  { emoji: '🎥', keywords: ['camera', 'video', 'film', 'movie'] },
  { emoji: '📽️', keywords: ['projector', 'film', 'movie', 'cinema'] },
  { emoji: '🎮', keywords: ['gaming', 'game', 'video game', 'controller'] },
  { emoji: '🕹️', keywords: ['joystick', 'gaming', 'arcade', 'game'] },
  { emoji: '🎵', keywords: ['music', 'song', 'audio', 'note'] },
  { emoji: '🎧', keywords: ['headphones', 'music', 'audio', 'listen'] },
  { emoji: '📚', keywords: ['books', 'reading', 'learning', 'study'] },
  { emoji: '💻', keywords: ['laptop', 'computer', 'tech', 'coding'] },
  { emoji: '🎯', keywords: ['target', 'goal', 'focus', 'aim'] },
  { emoji: '🏆', keywords: ['trophy', 'winner', 'champion', 'award'] },
  { emoji: '⚡', keywords: ['lightning', 'energy', 'power', 'fast'] },
  { emoji: '💡', keywords: ['idea', 'light', 'bulb', 'innovation'] },
  { emoji: '🔧', keywords: ['tool', 'wrench', 'fix', 'repair'] },
  { emoji: '🚀', keywords: ['rocket', 'space', 'launch', 'startup'] },
  { emoji: '🌍', keywords: ['world', 'earth', 'globe', 'travel'] },
  { emoji: '☕', keywords: ['coffee', 'cafe', 'drink', 'morning'] },
  { emoji: '🎸', keywords: ['guitar', 'music', 'rock', 'instrument'] },
  { emoji: '🎹', keywords: ['piano', 'keyboard', 'music', 'instrument'] },
  { emoji: '🎲', keywords: ['dice', 'game', 'board game', 'random'] },
  { emoji: '👾', keywords: ['alien', 'space invader', 'gaming', 'retro'] },
  { emoji: '🤖', keywords: ['robot', 'ai', 'tech', 'automation'] },
  { emoji: '📱', keywords: ['phone', 'mobile', 'smartphone', 'app'] },
  { emoji: '🏠', keywords: ['home', 'house', 'lifestyle', 'living'] },
  { emoji: '🍳', keywords: ['cooking', 'food', 'kitchen', 'breakfast'] },
  { emoji: '⚽', keywords: ['soccer', 'football', 'sports', 'ball'] },
  { emoji: '🏀', keywords: ['basketball', 'sports', 'ball', 'nba'] },
  { emoji: '🎾', keywords: ['tennis', 'sports', 'ball', 'racket'] },
  { emoji: '🏋️', keywords: ['gym', 'fitness', 'workout', 'exercise'] },
  { emoji: '🧘', keywords: ['yoga', 'meditation', 'wellness', 'zen'] },
  { emoji: '🚴', keywords: ['cycling', 'bike', 'sports', 'exercise'] },
  { emoji: '✈️', keywords: ['plane', 'travel', 'flight', 'vacation'] },
  { emoji: '🏔️', keywords: ['mountain', 'nature', 'hiking', 'outdoor'] },
  { emoji: '🎓', keywords: ['graduation', 'education', 'school', 'learning'] },
  { emoji: '✏️', keywords: ['pencil', 'write', 'draw', 'school'] },
  { emoji: '🔬', keywords: ['microscope', 'science', 'research', 'lab'] },
  { emoji: '🧪', keywords: ['chemistry', 'science', 'experiment', 'lab'] },
  { emoji: '🧠', keywords: ['brain', 'mind', 'thinking', 'psychology'] },
  { emoji: '📖', keywords: ['book', 'reading', 'story', 'open book'] },
  { emoji: '🎤', keywords: ['microphone', 'singing', 'podcast', 'karaoke'] },
  { emoji: '🎞️', keywords: ['film', 'frames', 'movie', 'cinema'] },
  { emoji: '📻', keywords: ['radio', 'audio', 'broadcast', 'music'] },
  { emoji: '🛠️', keywords: ['tools', 'diy', 'repair', 'build'] },
  { emoji: '🪴', keywords: ['plant', 'garden', 'nature', 'green'] },
  { emoji: '🛒', keywords: ['shopping', 'cart', 'store', 'buy'] },
  { emoji: '🏖️', keywords: ['beach', 'vacation', 'summer', 'relax'] },
  { emoji: '⛵', keywords: ['sailboat', 'sailing', 'ocean', 'boat'] },
  { emoji: '🦷', keywords: ['tooth', 'teeth', 'dental', 'dentist'] },
  { emoji: '🩺', keywords: ['medical', 'health', 'doctor', 'stethoscope'] },
  { emoji: '🧬', keywords: ['dna', 'genetics', 'science', 'biology'] },
  { emoji: '🔭', keywords: ['telescope', 'astronomy', 'space', 'science'] },
  { emoji: '⚗️', keywords: ['alchemy', 'chemistry', 'science', 'potion'] },
  { emoji: '🧲', keywords: ['magnet', 'physics', 'science', 'attraction'] },
  { emoji: '💊', keywords: ['pill', 'medicine', 'health', 'pharmacy'] },
  { emoji: '🩻', keywords: ['xray', 'medical', 'bones', 'health'] },
  { emoji: '💰', keywords: ['money', 'cash', 'finance', 'wealth'] },
  { emoji: '💵', keywords: ['dollar', 'money', 'cash', 'bills'] },
  { emoji: '💳', keywords: ['credit card', 'money', 'payment', 'finance'] },
  { emoji: '📈', keywords: ['chart', 'stocks', 'growth', 'finance', 'investing'] },
  { emoji: '🏦', keywords: ['bank', 'money', 'finance', 'savings'] },
  { emoji: '💎', keywords: ['diamond', 'gem', 'wealth', 'luxury'] },
  { emoji: '🎨', keywords: ['art', 'painting', 'color', 'palette', 'creative'] },
  { emoji: '🖌️', keywords: ['brush', 'painting', 'art', 'draw'] },
  { emoji: '✨', keywords: ['sparkle', 'magic', 'stars', 'special'] },
]

// Color palette - organized by hue, each row goes from rich to pastel
const COLORS = [
  // Row 1: Reds (dark to light)
  '#8B0000', '#C0392B', '#E74C3C', '#E57373', '#EF9A9A', '#FFCDD2', '#FFEBEE', '#FFF5F5',
  // Row 2: Pinks (dark to light)
  '#880E4F', '#AD1457', '#E91E63', '#F06292', '#F48FB1', '#F8BBD9', '#FCE4EC', '#FFF0F5',
  // Row 3: Oranges (dark to light)
  '#BF360C', '#D35400', '#E67E22', '#FF9800', '#FFB74D', '#FFCC80', '#FFE0B2', '#FFF3E0',
  // Row 4: Yellows (dark to light)
  '#F57F17', '#F9A825', '#FBC02D', '#FFEB3B', '#FFF176', '#FFF59D', '#FFF9C4', '#FFFDE7',
  // Row 5: Greens (dark to light)
  '#1B5E20', '#2E7D32', '#43A047', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9', '#E8F5E9',
  // Row 6: Teals (dark to light)
  '#004D40', '#00695C', '#00897B', '#26A69A', '#4DB6AC', '#80CBC4', '#B2DFDB', '#E0F2F1',
  // Row 7: Blues (dark to light)
  '#0D47A1', '#1565C0', '#1976D2', '#2196F3', '#64B5F6', '#90CAF9', '#BBDEFB', '#E3F2FD',
  // Row 8: Purples (dark to light)
  '#4A148C', '#6A1B9A', '#8E24AA', '#AB47BC', '#BA68C8', '#CE93D8', '#E1BEE7', '#F3E5F5',
  // Row 9: Browns (dark to light)
  '#3E2723', '#4E342E', '#5D4037', '#6D4C41', '#8D6E63', '#A1887F', '#BCAAA4', '#D7CCC8',
  // Row 10: Grays (dark to light)
  '#212121', '#424242', '#616161', '#757575', '#9E9E9E', '#BDBDBD', '#E0E0E0', '#F5F5F5',
]

export default function GroupModal({ group, onClose, onSave }: GroupModalProps) {
  const [name, setName] = useState(group?.name || '')
  const [icon, setIcon] = useState(group?.icon || '📺')
  const [color, setColor] = useState(group?.color || '#C19A6B')
  const [saving, setSaving] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [iconSearch, setIconSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!group

  // Filter icons based on search
  const filteredIcons = iconSearch.trim()
    ? ICONS_DATA.filter(({ keywords }) =>
        keywords.some(k => k.toLowerCase().includes(iconSearch.toLowerCase()))
      )
    : ICONS_DATA

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)

    try {
      await onSave({ name: name.trim(), icon, color })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Main Modal */}
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-md rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
          {/* Header with preview */}
          <div className="flex items-center gap-4 mb-6">
            {/* Clickable icon preview */}
            <button
              type="button"
              onClick={() => {
                setShowIconPicker(true)
                setShowColorPicker(false)
              }}
              className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 transition-all hover:scale-105"
              style={{ backgroundColor: `${color}40` }}
              title="Click to change icon"
            >
              {icon}
            </button>
            <div className="flex-1">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name..."
                className="w-full text-xl font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
              />
              <p className="text-sm text-muted-foreground">
                {isEditing ? 'Edit group' : 'New group'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Color selector */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Color</p>
              <button
                type="button"
                onClick={() => {
                  setShowColorPicker(true)
                  setShowIconPicker(false)
                }}
                className="w-12 h-12 rounded-xl border-2 border-muted/50 transition-all hover:scale-105"
                style={{ backgroundColor: color }}
                title="Click to change color"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || saving}
                className="flex-1 h-11 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : isEditing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Icon Picker Popover */}
      {showIconPicker && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowIconPicker(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] p-4 shadow-2xl">
            <p className="text-sm font-medium mb-3">Choose an icon</p>
            {/* Search bar */}
            <input
              type="text"
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Search icons..."
              className="w-full h-9 px-3 mb-3 rounded-lg border bg-muted/30 text-sm placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-accent/50"
              autoFocus
            />
            <div className="grid grid-cols-8 gap-2">
              {filteredIcons.map(({ emoji }) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setIcon(emoji)
                    setShowIconPicker(false)
                    setIconSearch('')
                  }}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                    icon === emoji
                      ? 'bg-accent/20 ring-2 ring-accent'
                      : 'hover:bg-muted'
                  }`}
                >
                  {emoji}
                </button>
              ))}
              {filteredIcons.length === 0 && (
                <p className="col-span-8 text-center text-sm text-muted-foreground py-4">
                  No icons found
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Color Picker Popover */}
      {showColorPicker && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowColorPicker(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border isolate bg-[#ffffff] dark:bg-[#262017] p-4 shadow-2xl">
            <p className="text-sm font-medium mb-3">Choose a color</p>
            <div className="grid grid-cols-8 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c)
                    setShowColorPicker(false)
                  }}
                  className={`w-10 h-10 rounded-lg transition-all ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

          </>
  )
}
