export default () => ({
  port: parseInt(process.env.PORT || '4001', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  garage: {
    endpoint: process.env.GARAGE_ENDPOINT || 'http://localhost:3900',
    publicEndpoint:
      process.env.GARAGE_PUBLIC_ENDPOINT ||
      process.env.GARAGE_ENDPOINT ||
      'http://localhost:3900',
    adminEndpoint:
      process.env.GARAGE_ADMIN_ENDPOINT || 'http://localhost:3903',
    adminToken: process.env.GARAGE_ADMIN_TOKEN,
    region: process.env.GARAGE_REGION || 'garage',
    accessKey: process.env.GARAGE_ACCESS_KEY,
    secretKey: process.env.GARAGE_SECRET_KEY,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  storage: {
    defaultQuotaGb: parseInt(process.env.DEFAULT_BUCKET_QUOTA_GB || '10', 10),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10),
    presignedUrlExpiresSec: parseInt(
      process.env.PRESIGNED_URL_EXPIRES_SECONDS || '3600',
      10,
    ),
  },
  // Email configuration for notifications
  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'noreply@garagestorage.local',
  },
  // Processing configuration
  processing: {
    thumbnail: {
      width: parseInt(process.env.THUMBNAIL_WIDTH || '300', 10),
      height: parseInt(process.env.THUMBNAIL_HEIGHT || '300', 10),
      format: process.env.THUMBNAIL_FORMAT || 'webp',
      quality: parseInt(process.env.THUMBNAIL_QUALITY || '80', 10),
    },
    maxImageSizeMb: parseInt(process.env.MAX_IMAGE_PROCESS_SIZE_MB || '50', 10),
    thumbnailPrefix: '_thumbnails/',
  },
  // Audit configuration
  audit: {
    enabled: process.env.AUDIT_ENABLED !== 'false',
    retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10),
  },
  // Alert configuration
  alerts: {
    defaultWarningThreshold: parseInt(
      process.env.ALERT_WARNING_THRESHOLD || '75',
      10,
    ),
    defaultCriticalThreshold: parseInt(
      process.env.ALERT_CRITICAL_THRESHOLD || '90',
      10,
    ),
    defaultCooldownMinutes: parseInt(
      process.env.ALERT_COOLDOWN_MINUTES || '60',
      10,
    ),
  },
});
