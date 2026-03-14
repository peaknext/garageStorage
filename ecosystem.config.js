module.exports = {
  apps: [
    {
      name: 'garage-storage-api',
      cwd: './backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4001,
      },
      env_file: './.env',
      max_memory_restart: '512M',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'garage-admin-ui',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '512M',
      error_file: './logs/ui-error.log',
      out_file: './logs/ui-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
