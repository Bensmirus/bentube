'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Hook to save and restore scroll position when navigating
 * Useful for preserving scroll position when going to a video page and back
 */
export function useScrollRestoration(key: string = 'feed-scroll') {
  const pathname = usePathname()
  const savedPosition = useRef<number | null>(null)

  useEffect(() => {
    // Restore scroll position on mount
    const savedScroll = sessionStorage.getItem(key)
    if (savedScroll) {
      savedPosition.current = parseInt(savedScroll, 10)
      // Wait for content to load before scrolling
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition.current || 0)
      })
      // Clear after restoring
      sessionStorage.removeItem(key)
    }

    // Save scroll position before navigating away
    const saveScroll = () => {
      sessionStorage.setItem(key, window.scrollY.toString())
    }

    // Listen for when user navigates away
    window.addEventListener('beforeunload', saveScroll)

    return () => {
      window.removeEventListener('beforeunload', saveScroll)
    }
  }, [key, pathname])

  // Function to manually save scroll position (call before navigation)
  const saveScrollPosition = () => {
    sessionStorage.setItem(key, window.scrollY.toString())
  }

  return { saveScrollPosition }
}
