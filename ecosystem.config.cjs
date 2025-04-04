module.exports = {
  apps: [{
    name: "reactstarter",
    script: "dist/index.js",
    instances: 1,
    exec_mode: "cluster",
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:salary@139.59.1.5:5432/postgres",
      PORT: 5001
    },
    env_production: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:salary@139.59.1.5:5432/postgres",
      PORT: 5001
    }
  }]
}; 