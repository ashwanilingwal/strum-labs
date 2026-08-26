import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async redirects() {
    // Chords and patterns folded into /learn; bookmarks keep working.
    return [
      { source: "/chords", destination: "/learn?tab=chords", permanent: false },
      { source: "/patterns", destination: "/learn?tab=patterns", permanent: false },
      { source: "/game", destination: "/play", permanent: false },
    ];
  },

  async headers() {
    return [
      {
        // The guitar recordings are ~5 MB and never change between deploys.
        // Without this every visit re-downloads them.
        //
        // Deliberately not `immutable`: the filenames are pitch centres
        // (55.flac) and stay the same when an instrument is rebuilt, so a
        // year-long immutable cache would pin listeners to stale audio after a
        // library swap. A week, with a month of stale-while-revalidate, gets
        // the repeat-visit win without that trap.
        source: "/samples/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
