import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React Strict Mode's dev-only double mount/unmount/remount of effects is
  // incompatible with Plyr's YouTube provider: it registers pending players
  // on the global, async `window.onYouTubeIframeAPIReady` callback, which
  // has no way to cancel a registration for an instance destroyed before the
  // YouTube API script (loaded over the network) finishes loading. When it
  // fires later, it crashes trying to use the already-destroyed instance.
  // See src/components/youtube-player.tsx for the full writeup.
  reactStrictMode: false,
};

export default nextConfig;
