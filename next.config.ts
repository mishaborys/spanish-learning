import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Версія збірки: змінюється з кожним деплоєм — тоді service worker оновлює офлайн-копію
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`,
  },
  async headers() {
    return [
      {
        // Сам service worker не кешуємо, щоб телефон завжди отримував свіжу версію
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
