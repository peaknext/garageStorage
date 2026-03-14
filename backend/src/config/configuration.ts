export default () => {
  // Parse Redis URL to extract host/port/password for Bull queue compatibility
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:9005';
  let parsedRedisHost = 'localhost';
  let parsedRedisPort = 9005;
  let parsedRedisPassword: string | undefined;
  try {
    const url = new URL(redisUrl);
    parsedRedisHost = url.hostname || 'localhost';
    parsedRedisPort = parseInt(url.port, 10) || 9005;
    parsedRedisPassword = url.password || undefined;
  } catch {
    // fallback to defaults
  }

  return {
  port: parseInt(process.env.PORT || '9001', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: redisUrl,
    host: process.env.REDIS_HOST || parsedRedisHost,
    port: parseInt(process.env.REDIS_PORT || String(parsedRedisPort), 10),
    password: process.env.REDIS_PASSWORD || parsedRedisPassword,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    publicEndpoint:
      process.env.S3_PUBLIC_ENDPOINT ||
      process.env.S3_ENDPOINT ||
      'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
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
    from: process.env.SMTP_FROM || 'noreply@skhstorage.local',
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
}; };
