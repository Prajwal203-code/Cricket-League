module.exports = {
  apps: [{
    name: 'cricket-strike',
    script: 'src/server.js',
    // Match ownership and queues are process-local. A Redis broadcast adapter
    // alone cannot share that state across workers.
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3005
    }
  }]
};
