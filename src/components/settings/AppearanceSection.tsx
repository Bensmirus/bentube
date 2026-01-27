'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export default function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [coloredIcons, setColoredIcons] = useState(true)

  // Avoid hydration mismatch and load saved preferences
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('colored-sidebar-icons')
    if (saved !== null) {
      setColoredIcons(saved === 'true')
    }
  }, [])

  const handleColoredIconsChange = (enabled: boolean) => {
    setColoredIcons(enabled)
    localStorage.setItem('colored-sidebar-icons', String(enabled))
    // Dispatch event so GroupSidebar updates immediately
    window.dispatchEvent(new CustomEvent('colored-icons-change', { detail: enabled }))
  }

  if (!mounted) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Appearance</h2>
        <div className="h-24 animate-pulse bg-muted rounded-xl" />
      </div>
    )
  }

  const themes = [
    { id: 'system', label: 'System', icon: '💻', description: 'Match your device settings' },
    { id: 'light', label: 'Light', icon: '☀️', description: 'Bright and clean' },
    { id: 'dark', label: 'Dark', icon: '🌙', description: 'Easy on the eyes' },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Appearance</h2>

      {/* Theme selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Theme</h3>
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
              theme === t.id
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-accent/50 hover:bg-muted/50'
            }`}
          >
            <span className="text-2xl">{t.icon}</span>
            <div className="text-left">
              <div className="font-medium">{t.label}</div>
              <div className="text-sm text-muted-foreground">{t.description}</div>
            </div>
            {theme === t.id && (
              <span className="ml-auto text-accent">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Sidebar options */}
      <div className="space-y-3 pt-4 border-t">
        <h3 className="text-sm font-medium text-muted-foreground">Sidebar</h3>
        <button
          onClick={() => handleColoredIconsChange(!coloredIcons)}
          className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
            coloredIcons
              ? 'border-accent bg-accent/10'
              : 'border-border hover:border-accent/50 hover:bg-muted/50'
          }`}
        >
          <span className="text-2xl">🎨</span>
          <div className="text-left flex-1">
            <div className="font-medium">Colored group icons</div>
            <div className="text-sm text-muted-foreground">Show color backgrounds on sidebar icons</div>
          </div>
          {/* Toggle switch */}
          <div
            className={`w-11 h-6 rounded-full relative transition-colors ${
              coloredIcons ? 'bg-accent' : 'bg-muted'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                coloredIcons ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </div>
        </button>
      </div>
    </div>
  )
}
