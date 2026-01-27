'use client'

import { useEffect, useState } from 'react'

interface HealthCheck {
  status: string
  timestamp: string
  required: Record<string, boolean>
  optional: Record<string, boolean>
  notes?: Record<string, string>
  summary?: {
    all_required_configured: boolean
    optional_features_enabled: boolean
  }
}

export default function DevStatusPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health')
        const data = await res.json()
        setHealth(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch health status')
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
    // Refresh every 5 seconds
    const interval = setInterval(fetchHealth, 5000)
    return () => clearInterval(interval)
  }, [])

  const envVars = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
    { key: 'GOOGLE_CLIENT_ID', required: true },
    { key: 'GOOGLE_CLIENT_SECRET', required: true },
    { key: 'NEXT_PUBLIC_APP_URL', required: true },
    { key: 'CRON_SECRET', required: true },
    { key: 'YOUTUBE_API_KEY', required: false },
    { key: 'SENTRY_DSN', required: false },
    { key: 'DISCORD_WEBHOOK_URL', required: false },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h1 className="text-3xl font-bold">Development Status Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time environment and health monitoring
          </p>
        </div>

        {/* Overall Status */}
        {health && (
          <div
            className={`p-6 rounded-lg border-2 ${
              health.status === 'healthy'
                ? 'bg-green-50 dark:bg-green-950 border-green-500'
                : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {health.status === 'healthy' ? '✅ System Healthy' : '⚠️ Configuration Issues'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                </p>
              </div>
              {health.summary && (
                <div className="text-right text-sm">
                  <div>
                    Required: {health.summary.all_required_configured ? '✅' : '❌'}
                  </div>
                  <div className="text-muted-foreground">
                    Optional: {health.summary.optional_features_enabled ? 'Some enabled' : 'None'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950 border-2 border-red-500">
            <p className="text-red-900 dark:text-red-100">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Required Environment Variables */}
        {health && (
          <div className="bg-card border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Required Configuration</h3>
            <div className="space-y-2">
              {Object.entries(health.required).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded border bg-background"
                >
                  <span className="font-mono text-sm">{key}</span>
                  <span className={value ? 'text-green-600' : 'text-red-600'}>
                    {value ? '✅ Configured' : '❌ Missing'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optional Environment Variables */}
        {health && (
          <div className="bg-card border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Optional Features</h3>
            <div className="space-y-2">
              {Object.entries(health.optional).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded border bg-background"
                >
                  <div>
                    <span className="font-mono text-sm">{key}</span>
                    {health.notes?.[key] && (
                      <p className="text-xs text-muted-foreground mt-1">{health.notes[key]}</p>
                    )}
                  </div>
                  <span className={value ? 'text-green-600' : 'text-gray-400'}>
                    {value ? '✅ Enabled' : '⚪ Not set'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Environment Variables Reference */}
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Environment Variables Reference</h3>
          <div className="space-y-3">
            {envVars.map(({ key, required }) => (
              <div
                key={key}
                className="flex items-start justify-between p-3 rounded border bg-background"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{key}</code>
                    {required && (
                      <span className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100">
                        REQUIRED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getEnvDescription(key)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="http://localhost:3002"
              className="p-3 rounded border bg-background hover:bg-muted transition-colors text-center"
            >
              🏠 Home Page
            </a>
            <a
              href="http://localhost:3002/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded border bg-background hover:bg-muted transition-colors text-center"
            >
              📊 Health API
            </a>
            <button
              onClick={() => window.location.reload()}
              className="p-3 rounded border bg-background hover:bg-muted transition-colors"
            >
              🔄 Refresh Status
            </button>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded border bg-background hover:bg-muted transition-colors text-center"
            >
              🗄️ Supabase Dashboard
            </a>
          </div>
        </div>

        {/* Commands Reference */}
        <div className="bg-card border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Useful Commands</h3>
          <div className="space-y-2 font-mono text-sm">
            <Command cmd="npm run validate-env" desc="Check environment variables" />
            <Command cmd="npm run dev:clean" desc="Clean build and restart" />
            <Command cmd="npm run kill-port" desc="Kill process on port 3002" />
            <Command cmd="npm run restart" desc="Kill port and restart server" />
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-4 border-t">
          <p>
            This page is only available in development mode.
            <br />
            Last updated: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

function Command({ cmd, desc }: { cmd: string; desc: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between p-3 rounded border bg-background">
      <div className="flex-1">
        <code className="text-accent">{cmd}</code>
        <p className="text-xs text-muted-foreground mt-1">{desc}</p>
      </div>
      <button
        onClick={copy}
        className="ml-4 px-3 py-1 text-xs rounded border hover:bg-muted transition-colors"
      >
        {copied ? '✅ Copied' : '📋 Copy'}
      </button>
    </div>
  )
}

function getEnvDescription(key: string): string {
  const descriptions: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: 'Supabase project URL from dashboard',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Public anon key (safe to expose)',
    SUPABASE_SERVICE_ROLE_KEY: 'Service role key (server-side only, keep secret)',
    GOOGLE_CLIENT_ID: 'OAuth client ID from Google Cloud Console',
    GOOGLE_CLIENT_SECRET: 'OAuth client secret (keep secret)',
    NEXT_PUBLIC_APP_URL: 'Base URL of the application (http://localhost:3002 for dev)',
    CRON_SECRET: 'Secret for authenticating cron job requests',
    YOUTUBE_API_KEY: 'Optional - not currently used (OAuth tokens used instead)',
    SENTRY_DSN: 'Optional - Sentry error tracking DSN',
    DISCORD_WEBHOOK_URL: 'Optional - Discord webhook for sync alerts',
  }
  return descriptions[key] || 'No description available'
}
