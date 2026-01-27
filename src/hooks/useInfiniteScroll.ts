'use client'

import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  /** Whether there are more items to load */
  hasNextPage: boolean
  /** Whether a fetch is currently in progress */
  isFetchingNextPage: boolean
  /** Function to fetch the next page */
  fetchNextPage: () => void
  /** Whether the initial data is still loading */
  isLoading?: boolean
  /** Whether the feature is enabled */
  enabled?: boolean
  /** Margin before the sentinel to trigger loading (default: 400px) */
  rootMargin?: string
  /** Threshold for intersection (default: 0) */
  threshold?: number
}

interface UseInfiniteScrollReturn {
  /** Ref to attach to the sentinel element */
  sentinelRef: React.RefObject<HTMLDivElement>
}

/**
 * Custom hook for implementing infinite scroll with IntersectionObserver.
 *
 * Features:
 * - Pre-loads content before reaching the bottom
 * - Prevents duplicate fetches
 * - Proper cleanup to avoid memory leaks
 * - Handles loading states correctly
 *
 * @example
 * ```tsx
 * const { sentinelRef } = useInfiniteScroll({
 *   hasNextPage,
 *   isFetchingNextPage,
 *   fetchNextPage,
 *   isLoading: feedLoading,
 * })
 *
 * return (
 *   <>
 *     {videos.map(video => <VideoCard key={video.id} />)}
 *     <div ref={sentinelRef} aria-hidden="true" />
 *   </>
 * )
 * ```
 */
export function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  isLoading = false,
  enabled = true,
  rootMargin = '400px',
  threshold = 0,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Memoize the fetch function to prevent unnecessary effect triggers
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  useEffect(() => {
    // Don't set up observer if disabled, loading, or no more pages
    if (!enabled || isLoading || !hasNextPage) {
      return
    }

    const sentinel = sentinelRef.current
    if (!sentinel) {
      return
    }

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin,
      threshold,
    })

    observer.observe(sentinel)

    return () => {
      observer.unobserve(sentinel)
      observer.disconnect()
    }
  }, [enabled, isLoading, hasNextPage, handleIntersection, rootMargin, threshold])

  return { sentinelRef }
}
