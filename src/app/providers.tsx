'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { PlaylistProvider } from '@/hooks/usePlaylist'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000, // 2 minutes (was 30 seconds - too aggressive)
            gcTime: 10 * 60 * 1000, // 10 minutes (was 5 - keep cache longer)
            refetchOnWindowFocus: false,
            retry: 3, // Retry 3 times (was 1 - too few)
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
          },
          mutations: {
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <PlaylistProvider>
          <SyncStatusBanner />
          {children}
        </PlaylistProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
