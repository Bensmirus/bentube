'use client'

import { useState } from 'react'

export default function ExtensionSection() {
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const downloadScript = async () => {
    setDownloading(true)
    setError(null)

    try {
      const res = await fetch('/api/extension/get-script', { method: 'POST' })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to generate script')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bentube.user.js'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setDownloaded(true)
    } catch {
      setError('Failed to download script')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold mb-1">Browser Extension</h2>
        <p className="text-sm text-muted-foreground">
          Add YouTube channels to BenTube directly from YouTube.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Step 1 */}
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
          1
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Install Tampermonkey</p>
          <p className="text-xs text-muted-foreground mt-1">
            Browser extension that runs userscripts
          </p>
          <a
            href="https://www.tampermonkey.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 px-3 h-8 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition-colors leading-8"
          >
            Get Tampermonkey
          </a>
        </div>
      </div>

      {/* Step 2 */}
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
          2
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Download your script</p>
          <p className="text-xs text-muted-foreground mt-1">
            Pre-configured with your API key
          </p>
          <button
            onClick={downloadScript}
            disabled={downloading}
            className="mt-2 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? 'Generating...' : downloaded ? 'Download Again' : 'Download Script'}
          </button>
        </div>
      </div>

      {/* Step 3 - Only show after download */}
      {downloaded && (
        <div className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            3
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Open the downloaded file</p>
            <p className="text-xs text-muted-foreground mt-1">
              Find <span className="font-mono bg-muted px-1 rounded">bentube.user.js</span> in your Downloads folder and open it. Tampermonkey will ask to install - click Install.
            </p>
          </div>
        </div>
      )}

      {/* Step 4 - Only show after download */}
      {downloaded && (
        <div className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-300 delay-150">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">
            ✓
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Done! Go to YouTube</p>
            <p className="text-xs text-muted-foreground mt-1">
              On any YouTube video or channel page, you will see a blue BenTube button next to Subscribe. Click it to add the channel to a group.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
