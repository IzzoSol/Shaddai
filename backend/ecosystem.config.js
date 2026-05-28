/**
 * PM2 Ecosystem Configuration for SHADDAI Backend v62
 *
 * Usage:
 *   pm2 start ecosystem.config.js        # Start
 *   pm2 restart ecosystem.config.js      # Restart
 *   pm2 delete ecosystem.config.js       # Stop and remove
 *   pm2 status                           # Show status
 *   pm2 logs shaddai-api                 # View logs
 *   pm2 monit                            # Monitor
 */

module.exports = {
  apps: [
    {
      name: 'shaddai-api',
      script: './server-production.js',

      // Clustering
      instances: 'max',           // Use all CPU cores
      exec_mode: 'cluster',       // Cluster mode for load balancing

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        DEBUG: 'true'
      },

      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000
      },

      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      time: true,

      // Memory management
      max_memory_restart: '1G',
      // Restart if process uses more than 1GB of memory

      // Auto restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // If app crashes 10 times in 1 second, don't restart

      // Graceful shutdown
      kill_timeout: 30000,
      // Wait 30 seconds for process to exit gracefully before killing

      wait_ready: true,
      // Wait for 'ready' message before marking as started

      listen_timeout: 5000,
      // Timeout for listening event

      shutdown_with_message: true,
      // Send shutdown message to app

      // Watch mode (development)
      watch: false,
      // Set to true and specify watch paths for auto-reload:
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', 'data/archives', '.git'],

      // Monitoring
      monitor_interval: 100,
      // Check resource usage every 100ms

      // Cron jobs (advanced)
      cron_restart: '0 2 * * *',
      // Restart daily at 2 AM (optional, comment out to disable)

      // Arguments
      args: '--env production',

      // Merge logs from multiple instances
      merge_logs: true,

      // Instances to start
      // instances: 4,  // Start exactly 4 instances (override 'max')

      // Max restarts per minute
      max_restarts: 10,

      // Min uptime before considering started
      min_uptime: '10s'
    }
  ],

  // Deploy configuration (optional)
  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/yourrepo/shaddai-backend.git',
      path: '/var/www/shaddai-backend',
      'post-deploy': 'npm install --production && pm2 restart ecosystem.config.js'
    },
    staging: {
      user: 'node',
      host: 'staging-server.com',
      ref: 'origin/develop',
      repo: 'https://github.com/yourrepo/shaddai-backend.git',
      path: '/var/www/shaddai-backend-staging',
      'post-deploy': 'npm install && npm run test && pm2 restart ecosystem.config.js'
    }
  }
};

/**
 * PM2 COMMANDS REFERENCE
 *
 * Basic Commands:
 *   pm2 start ecosystem.config.js             # Start with config
 *   pm2 start server-production.js            # Start directly
 *   pm2 status                                # Show process status
 *   pm2 logs                                  # Show logs
 *   pm2 monit                                 # Monitor CPU/memory
 *
 * Process Management:
 *   pm2 restart shaddai-api                   # Restart process
 *   pm2 stop shaddai-api                      # Stop process
 *   pm2 delete shaddai-api                    # Remove process
 *   pm2 reload ecosystem.config.js            # Zero-downtime reload
 *
 * Log Management:
 *   pm2 logs shaddai-api                      # Show process logs
 *   pm2 logs shaddai-api --lines 100          # Last 100 lines
 *   pm2 flush                                 # Clear all logs
 *
 * Cluster Management:
 *   pm2 scale shaddai-api +2                  # Add 2 instances
 *   pm2 scale shaddai-api 4                   # Set to 4 instances
 *   pm2 kill                                  # Kill PM2 daemon
 *
 * Info & Monitoring:
 *   pm2 show shaddai-api                      # Show process info
 *   pm2 web                                   # Start web dashboard (port 9615)
 *   pm2 save                                  # Save process list
 *   pm2 startup                               # Setup auto-start on reboot
 *   pm2 unstartup                             # Remove auto-start
 *
 * Advanced:
 *   pm2 trigger shaddai-api action            # Trigger custom action
 *   pm2 dump                                  # Dump current process list
 *   pm2 resurrect                             # Restore from dump
 *   pm2 prettylist                            # Show formatted list
 */
