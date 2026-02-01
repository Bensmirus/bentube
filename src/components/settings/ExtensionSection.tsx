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
    <div className="space-y-4">
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

      {!downloaded ? (
        <div className="pt-2">
          <button
            onClick={downloadScript}
            disabled={downloading}
            className="px-5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? 'Generating...' : 'Download Script'}
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            Requires <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener noreferrer" className="underline">Tampermonkey</a>
          </p>
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Script downloaded!
            </p>
            <p className="text-sm text-green-600 dark:text-green-500 mt-1">
              Open <span className="font-mono">bentube.user.js</span> from your Downloads folder. Tampermonkey will ask to install it.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Then on YouTube:</p>
            <p className="text-xs text-muted-foreground">
              Look for the blue BenTube button next to Subscribe. Click it to add channels to your groups.
            </p>
          </div>

          <button
            onClick={downloadScript}
            disabled={downloading}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Download again
          </button>
        </div>
      )}
    </div>
  )
}
