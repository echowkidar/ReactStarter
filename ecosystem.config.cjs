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
      PORT: 5001
    },
    env_production: {
      NODE_ENV: "production",
      PORT: 5001
    }
  }]
}; 
