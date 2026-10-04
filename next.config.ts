import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next would otherwise write AGENTS.md and CLAUDE.md into the repo on dev startup.
  agentRules: false,
  // The app is opened at 127.0.0.1. Without this, Next blocks the dev client.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
