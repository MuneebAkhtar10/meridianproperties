import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * Receipts, bills and maintenance photos are posted through Server
       * Actions, and the default body limit is 1MB. Over that, the request is
       * killed before the action runs, so nothing can redirect back with a
       * reason and the user just gets a blank "server error" page. 4.5MB is
       * Vercel's own request ceiling, so asking for more would buy nothing; the
       * per-file cap in `lib/upload-limits.ts` sits under this and is the limit
       * users actually meet, in the form, with an explanation.
       */
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
