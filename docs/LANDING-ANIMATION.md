# Landing Page Animation - Specification

## Animation Timeline

```
0ms      → Page loads, typing effect begins
0-960ms  → "Ben.Tube" types character by character (120ms/char) with blinking cursor
1360ms   → Typing complete, 400ms pause
1360ms   → Glitch flip begins
1760ms   → "Tube" glitches to "Ware" + "smart tools" appears (at frame 8)
2110ms   → Glitch flip ends (frame 15)
2910ms   → 800ms pause, then exit glitch begins
3390ms   → Exit glitch fades out (12 frames × 40ms)
3390ms+  → Feed or Login content fully visible
```

---

## Animation Phases

| Phase | Duration | What Happens |
|-------|----------|--------------|
| `typing` | 0-1360ms | Types "Ben.Tube" with blinking cursor (zero-width cursor to prevent layout shift) |
| `glitchFlip` | 1360-2910ms | Chromatic aberration glitch, Tube→Ware swap + "smart tools" appears |
| `glitchOut` | 2910-3390ms | Glitch effect fades out, grain overlay, feed fades in |
| `done` | 3390ms+ | Feed or Login content fully visible |

---

## Key Effects

### 1. Typing Effect
- Characters appear every 120ms
- Blinking cursor (530ms interval)
- "Ben." in foreground color, "Tube" in accent color
- Cursor has `width: 0` with `overflow: visible` to prevent layout shift when removed

### 2. Glitch Flip (Tube → Ware + smart tools)
- Chromatic aberration effect (red/cyan color split via text-shadow)
- No position movement - only color distortion
- Random character replacement during peak intensity
- "Ware" and "smart tools" appear synchronized at frame 8
- Intensity peaks in middle: `Math.sin((frame / 15) * Math.PI)`

### 3. Exit Glitch
- Rapid flickering glitch that fades: `Math.abs(Math.sin(frame * 2)) * (1 - frame / 12)`
- Grain overlay fades in during glitch
- Landing layer opacity fades out
- Feed/Login content fades in underneath

---

## Files

### `src/app/page.tsx`
Main animation component with all phases and effects.

### `src/app/globals.css`
```css
/* Static grain texture */
.grain-static {
  background-image: url("data:image/svg+xml,...");
  background-size: 200px 200px;
}
```

### `src/components/FeedContent.tsx`
Authenticated user feed (rendered inline after animation).

### `src/components/LoginContent.tsx`
Login page with Google OAuth (rendered inline after animation).

---

## Glitch Effect Details

### Chromatic Aberration (Color Split)
```tsx
const getGlitchStyle = (intensity: number, seed: number) => {
  if (intensity < 0.1) return {}
  const offsetX = Math.sin(seed * 123.456) * intensity * 4
  return {
    textShadow: `${offsetX}px 0 0 rgba(255,0,0,0.7), ${-offsetX}px 0 0 rgba(0,255,255,0.7)`,
  }
}
```

### Random Character Replacement
```tsx
const glitchChars = ['@', '#', '$', '%', '&', '*', '!', '?', '/', '\\', '|', '_']
// Characters randomly replaced when intensity > 0.3
```

---

## State Variables

```tsx
phase: 'typing' | 'glitchFlip' | 'glitchOut' | 'done'
typedText: string           // Current typed characters
showCursor: boolean         // Blinking cursor state
glitchFrame: number         // Frame counter for glitch flip (0-15)
showWare: boolean           // Show "Ware" instead of "Tube"
showSmartTools: boolean     // Show "smart tools" tagline
exitFrame: number           // Frame counter for exit glitch (0-12)
user: boolean | null        // Auth status for routing
```

---

## Architecture

```
┌─────────────────────────────────────┐
│  Root Container (min-h-screen)      │
│  ┌───────────────────────────────┐  │
│  │  UNDERLAYER (z-0)             │  │
│  │  FeedContent or LoginContent  │  │
│  │  opacity: fades in during     │  │
│  │  glitchOut phase              │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  LANDING LAYER (z-10)         │  │
│  │  - Background                 │  │
│  │  - Grain overlay (z-50)       │  │
│  │  - Logo + tagline (z-30)      │  │
│  │  opacity: fades out during    │  │
│  │  glitchOut phase              │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

The underlayer is always rendered and fades in as the landing fades out - this prevents any flash or blink at the end.

---

## Important Implementation Notes

1. **Cursor Layout** - The blinking cursor uses `width: 0` with `overflow: visible` so it doesn't affect text centering when it disappears

2. **No Position Shifts** - Glitch effect only uses `text-shadow` for chromatic aberration, no `transform` that would move text

3. **Synchronized Appearance** - "Ware" and "smart tools" both appear at exactly frame 8 of the glitch flip

4. **Animation Always Plays** - No localStorage check, animation runs every page load
