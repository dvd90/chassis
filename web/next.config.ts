import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The API and the web app keep separate lockfiles, so Next has to be told
  // which directory is the root of this app's file tracing.
  outputFileTracingRoot: path.dirname(new URL(import.meta.url).pathname)
};

export default nextConfig;
