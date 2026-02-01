// Global limits for user storage
// 20,000 videos ≈ 100MB at ~5KB per video (conservative estimate)
// Includes: video row (~4KB) + indexes (~1KB) + watch_status overhead

export const USER_VIDEO_LIMIT = 20000
export const USER_VIDEO_WARNING_THRESHOLD = 0.8 // 80% = 16,000 videos
