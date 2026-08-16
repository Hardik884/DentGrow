import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
      /**
       * Server Action request-body cap.
       *
       * Next.js defaults this to 1 MB. Every file upload in DentGrow travels
       * through a Server Action as multipart FormData (consent scans, treatment
       * documents, dentist signatures), so the default silently capped ALL of
       * them at 1 MB — well below the limits those features advertise.
       *
       * Exceeding it is NOT a normal action error: Next rejects the request
       * while parsing the body, before the action function runs, and raises an
       * uncaughtException ("Body exceeded 1 MB limit", statusCode 413). The
       * action's own size check and try/catch never execute, and the client
       * receives an error page instead of an RSC flight response — which
       * surfaced as "Application error: a client-side exception has occurred".
       *
       * Keep this comfortably ABOVE the largest per-file limit the app accepts
       * (see MAX_CONSENT_UPLOAD_SIZE) to leave room for multipart framing and
       * the accompanying metadata fields. Note the hosting platform applies its
       * own request-body cap on top of this (~4.5 MB for Vercel serverless
       * functions), so raising this value alone does not permit larger uploads.
       */
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
