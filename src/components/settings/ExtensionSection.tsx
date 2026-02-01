'use client'

import { useState, useEffect } from 'react'

export default function ExtensionSection() {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if user has an API key
  useEffect(() => {
    checkApiKey()
  }, [])

  const checkApiKey = async () => {
    try {
      const res = await fetch('/api/extension/api-key')
      const data = await res.json()
      setHasApiKey(data.hasApiKey)
    } catch {
      setError('Failed to check API key status')
    } finally {
      setLoading(false)
    }
  }

  const generateKey = async () => {
    setGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/extension/api-key', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to generate key')
        return
      }

      setNewApiKey(data.apiKey)
      setHasApiKey(true)
    } catch {
      setError('Failed to generate API key')
    } finally {
      setGenerating(false)
    }
  }

  const revokeKey = async () => {
    if (!confirm('Are you sure? This will stop the browser extension from working.')) {
      return
    }

    setRevoking(true)
    setError(null)

    try {
      const res = await fetch('/api/extension/api-key', { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to revoke key')
        return
      }

      setHasApiKey(false)
      setNewApiKey(null)
    } catch {
      setError('Failed to revoke API key')
    } finally {
      setRevoking(false)
    }
  }

  const copyKey = async () => {
    if (!newApiKey) return

    try {
      await navigator.clipboard.writeText(newApiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Failed to copy to clipboard')
    }
  }

  const closeKeyModal = () => {
    setNewApiKey(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Browser Extension</h2>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Browser Extension</h2>
        <p className="text-sm text-muted-foreground">
          Add YouTube channels to your groups directly from YouTube using a browser userscript.
        </p>
      </div>

      {/* API Key Status */}
      <div className="pt-4 border-t space-y-3">
        <h3 className="text-sm font-medium">API Key</h3>

        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              hasApiKey ? 'bg-green-500' : 'bg-gray-400'
            }`}
          />
          <span className="text-sm text-muted-foreground">
            {hasApiKey ? 'Active' : 'Not configured'}
          </span>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={generateKey}
            disabled={generating}
            className="px-5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating
              ? 'Generating...'
              : hasApiKey
                ? 'Regenerate Key'
                : 'Generate Key'}
          </button>

          {hasApiKey && (
            <button
              onClick={revokeKey}
              disabled={revoking}
              className="px-5 h-10 rounded-lg border text-sm font-medium hover:bg-muted transition-colors text-red-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {revoking ? 'Revoking...' : 'Revoke Key'}
            </button>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="pt-4 border-t space-y-3">
        <h3 className="text-sm font-medium">Setup Instructions</h3>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>
            Install{' '}
            <a
              href="https://www.tampermonkey.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Tampermonkey
            </a>{' '}
            browser extension
          </li>
          <li>Generate an API key above</li>
          <li>
            Create a new userscript in Tampermonkey and paste the code from{' '}
            <a
              href="https://gist.github.com/bentube/userscript"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              this gist
            </a>
          </li>
          <li>Enter your API key in the userscript settings</li>
          <li>Visit any YouTube channel or video page</li>
          <li>Click the BenTube button next to Subscribe</li>
        </ol>
      </div>

      {/* New API Key Modal */}
      {newApiKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Your New API Key</h3>
            <p className="text-sm text-muted-foreground">
              Copy this key now. It will not be shown again!
            </p>

            <div className="bg-muted rounded-lg p-3 font-mono text-sm break-all">
              {newApiKey}
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyKey}
                className="flex-1 px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Key'}
              </button>
              <button
                onClick={closeKeyModal}
                className="px-4 h-10 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
