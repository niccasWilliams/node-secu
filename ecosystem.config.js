module.exports = {
  apps: [
    {
      name: "node-secu",
      script: "src/app.ts",
      interpreter: "./node_modules/.bin/tsx",
      watch: ["src"],
      ignore_watch: ["node_modules", ".git", "dist", "drizzle/archive"],
      env: {
        NODE_ENV: "production",
        PATH: process.env.PATH,
      },
      autorestart: true,
      max_memory_restart: "1G",
    },
  ],
};
