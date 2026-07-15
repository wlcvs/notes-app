"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Minimal typings for the slice of the YouTube IFrame Player API we use.
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  playVideo(): void;
  destroy(): void;
}
// YT.PlayerState.PLAYING
const YT_PLAYING = 1;
interface YTPlayerEvents {
  onReady?: () => void;
  onStateChange?: (event: { data: number }) => void;
}
interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: YTPlayerEvents;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// The IFrame API exposes a single global ready callback and a single global
// namespace, so the script is loaded exactly once and shared by every player
// through this promise.
let ytApiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<YTNamespace>((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

export interface YouTubePlayerHandle {
  /** Seek the embedded player to `seconds` and start playing. */
  seekTo(seconds: number): void;
  /** Current playback position in seconds (0 if the player isn't ready). */
  getCurrentTime(): number;
}

interface YouTubePlayerProps {
  videoId: string;
}

/**
 * Wraps the YouTube IFrame Player API. The `YT.Player` instance is held in a
 * ref (never state — it is non-serializable and must not trigger re-render) and
 * `seekTo` / `getCurrentTime` are exposed imperatively to the transcript.
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayer | null>(null);
    // YouTube silently drops seekTo() on a video that hasn't started yet (cued),
    // so we remember the target and re-apply it once the player reports PLAYING.
    const pendingSeekRef = useRef<number | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        seekTo(seconds: number) {
          const player = playerRef.current;
          if (!player) return;
          // playVideo() must run synchronously inside the click gesture, or the
          // browser's autoplay policy blocks playback. The seek is attempted now
          // (works once playing) and re-applied on the first PLAYING event to
          // cover the cued case where this initial seekTo is dropped.
          pendingSeekRef.current = seconds;
          player.seekTo(seconds, true);
          player.playVideo();
        },
        getCurrentTime() {
          return playerRef.current?.getCurrentTime() ?? 0;
        },
      }),
      [],
    );

    useEffect(() => {
      let cancelled = false;
      loadYouTubeApi().then((YT) => {
        if (cancelled || !mountRef.current) return;
        playerRef.current = new YT.Player(mountRef.current, {
          videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onStateChange: (event) => {
              if (
                event.data === YT_PLAYING &&
                pendingSeekRef.current != null &&
                playerRef.current
              ) {
                playerRef.current.seekTo(pendingSeekRef.current, true);
                pendingSeekRef.current = null;
              }
            },
          },
        });
      });
      return () => {
        cancelled = true;
        pendingSeekRef.current = null;
        playerRef.current?.destroy();
        playerRef.current = null;
      };
    }, [videoId]);

    return (
      <div className="aspect-video w-full overflow-hidden border border-border-strong bg-black">
        {/* YT replaces this node with an iframe; keying on videoId gives each
            video a fresh mount point. */}
        <div key={videoId} ref={mountRef} className="h-full w-full" />
      </div>
    );
  },
);
