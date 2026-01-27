'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiQuotaBar } from '@/components/ApiQuotaBar'
import { AlertsSection } from './AlertsSection'
import { useSyncStatus } from '@/hooks/useSyncStatus'

export default function ImportSection() {
  const [exporting, setExporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { isActive } = useSyncStatus()

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/data/export')
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bentube-export-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        const data = await res.json()
        console.error('Export failed:', data.error)
      }
    } catch (error) {
      console.error('Export error:', error)
    } finally {
      setExporting(false)
    }
  }

  const handleSync = async () => {
    if (isActive) return // Don't start if already syncing

    setSyncing(true)
    setSyncError(null)

    try {
      const res = await fetch('/api/sync/videos', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setSyncError(data.error || 'Sync failed')
        return
      }

      // Invalidate feed queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['infiniteFeed'] })
      queryClient.invalidateQueries({ queryKey: ['syncStatus'] })
    } catch (error) {
      console.error('Sync error:', error)
      setSyncError('Failed to start sync')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Import & Sync</h2>
        <p className="text-sm text-muted-foreground">
          Sync your channels, manage data, and view notifications.
        </p>
      </div>

      {/* Alerts Section */}
      <AlertsSection />

      {/* Manual Sync */}
      <div className="pt-4 border-t space-y-3">
        <h3 className="text-sm font-medium">Manual Sync</h3>
        <p className="text-xs text-muted-foreground">
          Check for new videos from all your subscribed channels. This uses your daily API quota.
        </p>

        {syncError && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {syncError}
          </div>
        )}

        <button
          onClick={handleSync}
          disabled={syncing || isActive}
          className="px-5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {syncing || isActive ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              {isActive ? 'Sync in progress...' : 'Starting...'}
            </>
          ) : (
            <>
              <SyncIcon className="w-4 h-4" />
              Sync Now
            </>
          )}
        </button>

        {isActive && (
          <p className="text-xs text-muted-foreground">
            A sync is currently running. Check the banner at the top for progress.
          </p>
        )}
      </div>

      {/* Data Export */}
      <div className="pt-4 border-t space-y-3">
        <h3 className="text-sm font-medium">Data Backup</h3>
        <p className="text-xs text-muted-foreground">
          Export your data as a JSON file for safekeeping. Includes groups, channels, watch history, notes, and tags.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-5 h-10 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {exporting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              Exporting...
            </>
          ) : (
            <>
              <DownloadIcon className="w-4 h-4" />
              Export Data
            </>
          )}
        </button>
      </div>

      {/* API Quota */}
      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground mb-3">YouTube API Daily Quota</p>
        <ApiQuotaBar />
      </div>
    </div>
  )
}

// Helper icons
function DownloadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

function SyncIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}
