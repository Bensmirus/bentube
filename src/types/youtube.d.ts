/**
 * YouTube IFrame API TypeScript definitions
 */

declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerOptions {
    videoId?: string
    width?: number | string
    height?: number | string
    playerVars?: PlayerVars
    events?: Events
  }

  interface PlayerVars {
    autoplay?: 0 | 1
    cc_lang_pref?: string
    cc_load_policy?: 0 | 1
    color?: 'red' | 'white'
    controls?: 0 | 1
    disablekb?: 0 | 1
    enablejsapi?: 0 | 1
    end?: number
    fs?: 0 | 1
    hl?: string
    iv_load_policy?: 1 | 3
    list?: string
    listType?: 'playlist' | 'search' | 'user_uploads'
    loop?: 0 | 1
    modestbranding?: 0 | 1
    mute?: 0 | 1
    origin?: string
    playlist?: string
    playsinline?: 0 | 1
    rel?: 0 | 1
    showinfo?: 0 | 1
    start?: number
  }

  interface Events {
    onReady?: (event: PlayerEvent) => void
    onStateChange?: (event: OnStateChangeEvent) => void
    onPlaybackQualityChange?: (event: OnPlaybackQualityChangeEvent) => void
    onPlaybackRateChange?: (event: OnPlaybackRateChangeEvent) => void
    onError?: (event: OnErrorEvent) => void
    onApiChange?: (event: PlayerEvent) => void
  }

  interface PlayerEvent {
    target: Player
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: PlayerState
  }

  interface OnPlaybackQualityChangeEvent extends PlayerEvent {
    data: string
  }

  interface OnPlaybackRateChangeEvent extends PlayerEvent {
    data: number
  }

  interface OnErrorEvent extends PlayerEvent {
    data: number
  }

  interface VideoData {
    video_id: string
    author: string
    title: string
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions)

    // Queueing functions
    loadVideoById(videoId: string, startSeconds?: number): void
    loadVideoById(options: { videoId: string; startSeconds?: number; endSeconds?: number }): void
    cueVideoById(videoId: string, startSeconds?: number): void
    cueVideoById(options: { videoId: string; startSeconds?: number; endSeconds?: number }): void
    loadVideoByUrl(mediaContentUrl: string, startSeconds?: number): void
    cueVideoByUrl(mediaContentUrl: string, startSeconds?: number): void
    loadPlaylist(playlist: string | string[], index?: number, startSeconds?: number): void
    cuePlaylist(playlist: string | string[], index?: number, startSeconds?: number): void

    // Playback controls
    playVideo(): void
    pauseVideo(): void
    stopVideo(): void
    seekTo(seconds: number, allowSeekAhead?: boolean): void
    nextVideo(): void
    previousVideo(): void
    playVideoAt(index: number): void

    // Volume controls
    mute(): void
    unMute(): void
    isMuted(): boolean
    setVolume(volume: number): void
    getVolume(): number

    // Size controls
    setSize(width: number, height: number): object

    // Playback rate
    getPlaybackRate(): number
    setPlaybackRate(suggestedRate: number): void
    getAvailablePlaybackRates(): number[]

    // Looping
    setLoop(loopPlaylists: boolean): void
    setShuffle(shufflePlaylist: boolean): void

    // Status
    getVideoLoadedFraction(): number
    getPlayerState(): PlayerState
    getCurrentTime(): number
    getDuration(): number
    getVideoUrl(): string
    getVideoEmbedCode(): string
    getVideoData(): VideoData
    getPlaylist(): string[]
    getPlaylistIndex(): number

    // Event listeners
    addEventListener(event: string, listener: (event: PlayerEvent) => void): void
    removeEventListener(event: string, listener: (event: PlayerEvent) => void): void

    // DOM
    getIframe(): HTMLIFrameElement
    destroy(): void
  }
}

interface Window {
  YT: typeof YT
  onYouTubeIframeAPIReady: () => void
}
