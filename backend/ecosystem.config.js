module.exports = {
  apps: [{
    name: 'cricket-strike',
    script: 'src/server.js',
    instances: 4, // Matches OCI Ampere A1 4 physical cores
    exec_mode: 'cluster',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
