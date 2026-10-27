import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker uses the minimal server; native Windows builds keep their existing
  // output to avoid requiring symlink privileges for standalone generation.
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
