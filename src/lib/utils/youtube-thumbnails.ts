/**
 * YouTube Thumbnail URL Utilities
 * Generates optimized thumbnail URLs based on display context
 */

export type ThumbnailSize = 'small' | 'medium' | 'large'

/**
 * Get YouTube thumbnail URL for a video
 * Uses different sizes for different contexts to optimize bandwidth
 *
 * @param youtubeId - YouTube video ID
 * @param size - Thumbnail size based on display context
 * @returns Thumbnail URL
 */
export function getYouTubeThumbnail(
  youtubeId: string,
  size: ThumbnailSize = 'medium'
): string {
  const baseUrl = 'https://i.ytimg.com/vi'

  switch (size) {
    case 'small':
      // 120x90 - for compact lists, mobile thumbnails
      return `${baseUrl}/${youtubeId}/default.jpg`

    case 'medium':
      // 320x180 - for feed view, default thumbnails
      return `${baseUrl}/${youtubeId}/mqdefault.jpg`

    case 'large':
      // 480x360 - for watch page, larger displays
      return `${baseUrl}/${youtubeId}/hqdefault.jpg`
  }
}

/**
 * Get YouTube channel thumbnail URL
 * Note: Channel thumbnails URLs can't be constructed from channel ID alone
 * Must be fetched from YouTube API
 */
export function getYouTubeChannelThumbnail(thumbnailUrl: string | null): string {
  if (!thumbnailUrl) {
    // Fallback to generic avatar
    return '/images/default-channel.png'
  }
  return thumbnailUrl
}

/**
 * Preload thumbnail image for faster display
 * Useful for watch page where large thumbnail is critical
 */
export function preloadThumbnail(youtubeId: string, size: ThumbnailSize = 'large'): void {
  if (typeof window === 'undefined') return

  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = getYouTubeThumbnail(youtubeId, size)
  document.head.appendChild(link)
}
