'use client'

import { useState } from 'react'

export default function ExtensionSection() {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const downloadScript = async () => {
    setDownloading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch('/api/extension/get-script', { method: 'POST' })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to generate script')
        return
      }

      // Get the script content and trigger download
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bentube.user.js'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setSuccess(true)
    } catch {
      setError('Failed to download script')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Browser Extension</h2>
        <p className="text-sm text-muted-foreground">
          Add YouTube channels to BenTube directly from YouTube.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
          Script downloaded! Open it to install in Tampermonkey.
        </div>
      )}

      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground mb-4">
          Requires <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Tampermonkey</a> browser extension
        </p>

        <button
          onClick={downloadScript}
          disabled={downloading}
          className="px-6 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {downloading ? 'Generating...' : 'Get Script'}
        </button>

        <p className="text-xs text-muted-foreground mt-4">
          Downloads a script with your API key pre-configured. Just install and use!
        </p>
      </div>

      <div className="pt-4 border-t">
        <p className="text-sm font-medium mb-2">How to use</p>
        <p className="text-xs text-muted-foreground">
          After installing, go to any YouTube video or channel and click the blue "BenTube" button to add it to a group.
        </p>
      </div>
    </div>
  )
}
