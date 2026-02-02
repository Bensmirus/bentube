'use client'

import { useState, useEffect } from 'react'

export default function ExtensionSection() {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkKeyStatus()
  }, [])

  const checkKeyStatus = async () => {
    try {
      const res = await fetch('/api/extension/api-key')
      const data = await res.json()
      setHasKey(data.hasApiKey)
    } catch {
      // Ignore - just won't show status
    }
  }

  const downloadScript = async () => {
    // Warn if replacing existing key
    if (hasKey && !downloaded) {
      const confirmed = confirm(
        'This will generate a new API key and replace your current one. Your old script will stop working.\n\nContinue?'
      )
      if (!confirmed) return
    }

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
      setHasKey(true)
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

      {/* Status indicator */}
      {hasKey !== null && (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-xs text-muted-foreground">
            {hasKey ? 'Extension active' : 'Not set up'}
          </span>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!downloaded ? (
        <div>
          <button
            onClick={downloadScript}
            disabled={downloading}
            className="px-5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? 'Generating...' : hasKey ? 'Download New Script' : 'Download Script'}
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            Requires <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener noreferrer" className="underline">Tampermonkey</a> browser extension
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Script downloaded!
            </p>
            <ol className="text-sm text-green-600 dark:text-green-500 mt-2 space-y-2 list-decimal list-inside">
              <li>Click Tampermonkey icon → Dashboard → Utilities tab</li>
              <li>Under &quot;Import from file&quot;, select <span className="font-mono bg-green-100 dark:bg-green-800/30 px-1 rounded">bentube.user.js</span></li>
              <li>Click Install when prompted</li>
              <li>Go to YouTube - look for the golden BenTube button next to Subscribe</li>
            </ol>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>On video pages:</strong> Choose to add just this video or subscribe to the channel</p>
            <p><strong>On channel pages:</strong> Subscribe to sync all future videos</p>
          </div>
          <button
            onClick={() => setDownloaded(false)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Download again
          </button>
        </div>
      )}
    </div>
  )
}
