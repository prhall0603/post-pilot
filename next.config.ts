import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (process.env.NODE_ENV === "development") {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: "@dyad-sh/nextjs-webpack-component-tagger",
      });
    }
    // instrumentation.ts is compiled for both runtimes; the edge bundle never
    // executes Node-only boot code (guarded by NEXT_RUNTIME), so resolve the
    // Node builtins it references to empty modules to avoid unresolved errors.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        module: false,
        path: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
