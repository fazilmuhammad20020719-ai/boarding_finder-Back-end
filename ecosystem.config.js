// PM2 process file:  pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: "boarding-backend",
      script: "server.js",
      cwd: __dirname,
      instances: 1, // WebSocket connections and rate-limit counters are in-memory — keep a single instance
      max_memory_restart: "300M",
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
    },
  ],
};
