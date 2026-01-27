'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import FeedContent from '@/components/FeedContent'
import LoginContent from '@/components/LoginContent'

const INTRO_LAST_SHOWN_KEY = 'bentube_intro_last_shown'
const ONE_HOUR = 60 * 60 * 1000

export default function Home() {
  const [user, setUser] = useState<boolean | null>(null)
  const [authError, setAuthError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Check if animation should play (once per hour)
  const [shouldAnimate] = useState(() => {
    try {
      const lastShown = localStorage.getItem(INTRO_LAST_SHOWN_KEY)
      const now = Date.now()
      if (!lastShown || (now - parseInt(lastShown, 10)) >= ONE_HOUR) {
        localStorage.setItem(INTRO_LAST_SHOWN_KEY, String(now))
        return true
      }
      return false
    } catch {
      return true // If localStorage fails, show animation
    }
  })

  // Animation state
  const [phase, setPhase] = useState<'typing' | 'glitchFlip' | 'glitchOut' | 'done'>(
    shouldAnimate ? 'typing' : 'done'
  )
  const [typedText, setTypedText] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const [glitchFrame, setGlitchFrame] = useState(0)
  const [showWare, setShowWare] = useState(false)
  const [showSmartTools, setShowSmartTools] = useState(false)
  const [exitFrame, setExitFrame] = useState(0)

  const fullText = 'Ben.Tube'

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthError(false)
        const supabase = createClient()

        // Add timeout to prevent infinite loading (8 seconds max)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Auth check timeout')), 8000)
        })

        const { data, error } = await Promise.race([
          supabase.auth.getUser(),
          timeoutPromise,
        ])

        if (error) {
          // AuthSessionMissingError is expected when not logged in
          if (error.message === 'Auth session missing!') {
            setUser(false)
            return
          }
          console.error('Auth error:', error)
          setAuthError(true)
          return
        }
        setUser(!!data.user)
      } catch (err) {
        console.error('Auth check failed:', err)
        setAuthError(true)
      }
    }
    checkAuth()
  }, [retryCount])

  // Cursor blinking
  useEffect(() => {
    if (phase === 'done') return
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 530)
    return () => clearInterval(interval)
  }, [phase])

  // Typing effect
  useEffect(() => {
    if (phase !== 'typing') return
    if (typedText.length < fullText.length) {
      const timeout = setTimeout(() => {
        setTypedText(fullText.slice(0, typedText.length + 1))
      }, 120)
      return () => clearTimeout(timeout)
    } else {
      // Typing complete, start glitch flip
      const timeout = setTimeout(() => {
        setPhase('glitchFlip')
      }, 400)
      return () => clearTimeout(timeout)
    }
  }, [phase, typedText])

  // Glitch flip animation (Tube → Ware + smart tools synchronized)
  useEffect(() => {
    if (phase !== 'glitchFlip') return

    let frame = 0
    const glitchInterval = setInterval(() => {
      frame++
      setGlitchFrame(frame)

      // At frame 8, show both Ware and smart tools together
      if (frame === 8) {
        setShowWare(true)
        setShowSmartTools(true)
      }

      // End glitch and move to exit glitch
      if (frame >= 15) {
        clearInterval(glitchInterval)
        setTimeout(() => setPhase('glitchOut'), 800)
      }
    }, 50)

    return () => clearInterval(glitchInterval)
  }, [phase])

  // Exit glitch animation
  useEffect(() => {
    if (phase !== 'glitchOut') return

    let frame = 0
    const glitchInterval = setInterval(() => {
      frame++
      setExitFrame(frame)

      // End after 12 frames
      if (frame >= 12) {
        clearInterval(glitchInterval)
        setPhase('done')
      }
    }, 40)

    return () => clearInterval(glitchInterval)
  }, [phase])

  // Glitch text variations
  const glitchChars = ['@', '#', '$', '%', '&', '*', '!', '?', '/', '\\', '|', '_']
  const getGlitchText = (text: string, intensity: number) => {
    if (intensity === 0) return text
    return text.split('').map((char) => {
      if (Math.random() < intensity * 0.3) {
        return glitchChars[Math.floor(Math.random() * glitchChars.length)]
      }
      return char
    }).join('')
  }

  // Calculate glitch intensity (peaks in middle, fades at end)
  const glitchIntensity = phase === 'glitchFlip'
    ? Math.sin((glitchFrame / 15) * Math.PI)
    : 0

  // Exit glitch intensity - rapid flickering that fades
  const exitGlitchIntensity = phase === 'glitchOut'
    ? Math.abs(Math.sin(exitFrame * 2)) * (1 - exitFrame / 12)
    : 0

  // Combined intensity for styling
  const currentGlitchIntensity = glitchIntensity || exitGlitchIntensity

  // Glitch style - only chromatic aberration, no position shift
  const getGlitchStyle = (intensity: number, seed: number): React.CSSProperties => {
    if (intensity < 0.1) return {}
    const offsetX = Math.sin(seed * 123.456) * intensity * 4
    return {
      textShadow: `${offsetX.toFixed(1)}px 0 0 rgba(255,0,0,${intensity * 0.7}), ${(-offsetX).toFixed(1)}px 0 0 rgba(0,255,255,${intensity * 0.7})`,
    }
  }

  // Exit fade opacity
  const exitOpacity = phase === 'glitchOut' ? 1 - (exitFrame / 12) : 1
  const underlayOpacity = phase === 'glitchOut' ? exitFrame / 12 : 0

  // Show error state with retry option
  if (authError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">Connection error. Please check your internet.</p>
          <button
            onClick={() => setRetryCount(c => c + 1)}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Show loading while checking auth
  if (user === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }


  return (
    <div className={`min-h-screen bg-background relative ${phase !== 'done' ? 'overflow-hidden' : ''}`}>
      {/* UNDERLAYER: Feed or Login content - always visible when done or fading in */}
      <div
        className={phase === 'done' ? '' : 'absolute inset-0 z-0'}
        style={{ opacity: phase === 'done' ? 1 : underlayOpacity }}
      >
        {user ? <FeedContent /> : <LoginContent />}
      </div>

      {/* LANDING LAYER */}
      {phase !== 'done' && (
        <div
          className="absolute inset-0 z-10 bg-background flex items-center justify-center"
          style={{ opacity: exitOpacity }}
        >
          {/* Grain overlay during exit glitch */}
          {phase === 'glitchOut' && (
            <div
              className="absolute inset-0 z-50 pointer-events-none grain-static"
              style={{ opacity: 0.3 + exitGlitchIntensity * 0.5 }}
            />
          )}

          {/* Logo and tagline */}
          <div className="text-center relative z-30">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold font-mono whitespace-nowrap">
              <span style={getGlitchStyle(currentGlitchIntensity, exitFrame || glitchFrame)}>
                {phase === 'typing'
                  ? typedText.slice(0, 4)
                  : (currentGlitchIntensity > 0.3 ? getGlitchText('Ben.', currentGlitchIntensity) : 'Ben.')
                }
              </span>
              <span className="text-accent" style={getGlitchStyle(currentGlitchIntensity, (exitFrame || glitchFrame) + 1)}>
                {phase === 'typing'
                  ? typedText.slice(4)
                  : (currentGlitchIntensity > 0.3 ? getGlitchText(showWare ? 'Ware' : 'Tube', currentGlitchIntensity) : (showWare ? 'Ware' : 'Tube'))
                }
              </span>
              {/* Cursor - zero width so it doesn't affect layout */}
              {phase === 'typing' && (
                <span
                  className="text-accent inline-block overflow-visible"
                  style={{
                    opacity: showCursor ? 1 : 0,
                    width: 0,
                  }}
                >
                  |
                </span>
              )}
            </h1>

            {/* Smart tools tagline - appears synchronized with Ware */}
            <div className="mt-4 h-8">
              {showSmartTools && (
                <p
                  className="text-lg text-muted-foreground font-mono"
                  style={getGlitchStyle(currentGlitchIntensity, (exitFrame || glitchFrame) + 2)}
                >
                  {currentGlitchIntensity > 0.3
                    ? getGlitchText('smart tools', currentGlitchIntensity)
                    : 'smart tools'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
