module.exports = {
  apps: [{
    name: "reactstarter",
    script: "dist/index.js",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "400M",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:salary@167.71.230.230:5432/postgres",
      PORT: 5001,
      BASE_URL: "https://salarysection.com"
    },
    env_production: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:salary@167.71.230.230:5432/postgres",
      PORT: 5001,
      BASE_URL: "https://salarysection.com"
    }
  }]
}; 
