import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use pino logger for structured JSON output
  app.useLogger(app.get(Logger));

  // Request correlation ID
  app.use((req: any, res: any, next: any) => {
    const correlationId = req.headers['x-request-id'] || uuidv4();
    req.headers['x-request-id'] = correlationId;
    res.setHeader('X-Request-Id', correlationId);
    next();
  });

  // Security
  app.use(helmet());

  // CORS - dynamic origin validation
  const adminUiUrl = process.env.ADMIN_UI_URL || 'http://localhost:9002';
  const allowedOrigins = [
    adminUiUrl,
    'http://localhost:3000', // Frontend dev server
    'http://localhost:9002', // Frontend Docker
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, mobile apps, curl)
      if (!origin) return callback(null, true);
      // Allow known admin UI origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // For API key-authenticated requests, ApiKeyGuard validates per-app origins
      // Allow the request here; the guard will enforce app-specific origin restrictions
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
  });

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix (exclude health check for Docker/K8s probes)
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('SKH Storage API')
    .setDescription('API for SKH Storage Service')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 9001;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
