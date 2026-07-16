"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import * as PlyrNamespace from "plyr";
import "plyr/dist/plyr.css";

const Plyr = PlyrNamespace.default;
type Plyr = PlyrNamespace.default;
import { formatTimestamp } from "./format";

export interface YouTubePlayerHandle {
  /** Seek the embedded player to `seconds` and start playing. */
  seekTo(seconds: number): void;
  /** Current playback position in seconds (0 if the player isn't ready). */
  getCurrentTime(): number;
  /** Duration in seconds once known. */
  getDuration(): number;
}

interface PlayerMarker {
  id: string;
  t: number;
  onClick: () => void;
}

interface YouTubePlayerProps {
  videoId: string;
  markers?: PlayerMarker[];
}

/**
 * Wraps Plyr configured for YouTube. Plyr replaces the native YouTube controls
 * with its own DOM, which lets us overlay square cyan markers on the progress
 * bar (one per entry). An imperative handle exposes seek, currentTime and
 * duration to the transcript.
 *
 * Instantiates Plyr directly (not via the `plyr-react` package): that
 * package's `instantiate` ignores the element ref it's given and instead
 * does `new Plyr(".plyr-react", ...)`, a global `document.querySelector` by
 * class name. Combined with React Strict Mode's dev-only double-invoke of
 * effects (mount -> cleanup -> mount) and the YouTube embed's async,
 * window.YT-registry-based setup, that class-selector lookup made the
 * create/destroy/recreate cycle unreliable in `next dev` (worked in
 * production, where Strict Mode is off). Targeting the actual ref'd element
 * ourselves avoids the ambiguity entirely.
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, markers = [] }, ref) {
    const mediaRef = useRef<HTMLVideoElement | null>(null);
    const plyrRef = useRef<Plyr | null>(null);
    const [duration, setDuration] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        seekTo(seconds: number) {
          const player = plyrRef.current;
          if (!player) return;
          player.currentTime = seconds;
          void player.play();
        },
        getCurrentTime() {
          return plyrRef.current?.currentTime ?? 0;
        },
        getDuration() {
          return plyrRef.current?.duration ?? 0;
        },
      }),
      [],
    );

    const options = useMemo(
      () => ({
        youtube: { noCookie: true, rel: 0, showinfo: 0, iv_load_policy: 3 },
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "duration",
          "mute",
          "volume",
          "settings",
          "pip",
          "fullscreen",
        ],
        settings: ["speed"],
        clickToPlay: false,
        hideControls: false,
      }),
      [],
    );

    useEffect(() => {
      const element = mediaRef.current;
      if (!element) return;

      const player = new Plyr(element, options);
      plyrRef.current = player;
      player.source = {
        type: "video",
        sources: [{ src: videoId, provider: "youtube" }],
      };

      // Plyr's public `.on()` listens on `elements.container`, fed by a
      // proxy listener bound to `player.media` inside `ui.build()`
      // (`Listeners.media()`). For the YouTube provider, `player.media` gets
      // replaced with a fresh element once the embed is ready
      // (`youtube.ready`'s `replaceElement` call) — but `ui.build()` is only
      // re-run later, from the YT player's `onStateChange`/buffering
      // callbacks (gated behind `config.customControls`), not immediately
      // when the element is swapped. So `player.on("timeupdate", ...)` (and
      // every other proxied event) can silently never fire until playback
      // actually starts, or can miss events fired in that window — this
      // isn't reliable enough to gate marker rendering on. Poll `player.
      // duration` directly instead: it's a plain getter backed by
      // `player.media.duration`, set synchronously once YouTube's `onReady`
      // completes, regardless of the listener wiring above.
      let raf: number;
      function pollDuration() {
        if (player.duration) {
          setDuration(player.duration);
          return;
        }
        raf = requestAnimationFrame(pollDuration);
      }
      pollDuration();

      return () => {
        cancelAnimationFrame(raf);
        player.destroy();
        plyrRef.current = null;
        setDuration(0);
      };
      // `options` is stable (useMemo, empty deps); only `videoId` should recreate the player.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    return (
      <div className="plyr-hud relative aspect-video w-full overflow-hidden border border-border-strong bg-black">
        <video ref={mediaRef} className="plyr" playsInline />

        {/* Overlay markers on Plyr's progress bar (rendered inside the widget
            after mount). Marker positions are recomputed when marker set or
            duration change. */}
        <ProgressMarkers duration={duration} markers={markers} />
      </div>
    );
  },
);

function usePlyrProgressHost() {
  return useSyncExternalStore(
    (callback) => {
      if (typeof document === "undefined") return () => {};
      const observer = new MutationObserver(callback);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    () => document.querySelector<HTMLDivElement>(".plyr__progress") ?? null,
    () => null,
  );
}

interface ProgressMarkersProps {
  duration: number;
  markers: PlayerMarker[];
}

function ProgressMarkers({ duration, markers }: ProgressMarkersProps) {
  const host = usePlyrProgressHost();

  if (!host || duration <= 0) return null;

  return (
    <>
      {markers.map((marker) => {
        const left = Math.min(100, Math.max(0, (marker.t / duration) * 100));
        return (
          <MarkerPortal
            key={`${marker.id}-${left.toFixed(2)}`}
            marker={marker}
            host={host}
            left={left}
          />
        );
      })}
    </>
  );
}

interface MarkerPortalProps {
  marker: PlayerMarker;
  host: HTMLDivElement;
  left: number;
}

/**
 * Render each marker as a React portal into Plyr's progress bar. The portal is
 * removed from the DOM automatically when it unmounts or its key changes.
 */
function MarkerPortal({ marker, host, left }: MarkerPortalProps) {
  const [container] = useState(() => {
    const el = document.createElement("button");
    el.type = "button";
    el.className =
      "plyr-timeline-marker absolute top-0 h-full w-1.5 -translate-x-1/2 cursor-pointer border-0 bg-accent-cyan p-0 hover:bg-foreground";
    el.style.left = `${left}%`;
    el.title = formatTimestamp(marker.t);
    return el;
  });

  useEffect(() => {
    host.appendChild(container);
    return () => {
      container.remove();
    };
  }, [container, host]);

  return createPortal(
    <span
      className="block h-full w-full"
      onClick={(e) => {
        e.stopPropagation();
        marker.onClick();
      }}
    />,
    container,
  );
}

export default YouTubePlayer;
