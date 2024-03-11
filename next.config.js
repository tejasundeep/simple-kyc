// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve 'fs' and 'child_process' modules on the client
      // to prevent errors related to these modules in a browser environment
      config.resolve.fallback = {
        fs: false,
      };
    }

    return config;
  },
  reactStrictMode: true,
};
