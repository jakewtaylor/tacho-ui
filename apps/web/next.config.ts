import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/ui ships raw TypeScript; Next.js needs to compile it
  // because by default it skips node_modules.
  transpilePackages: ["@tacholens/ui"],
};

export default nextConfig;
