# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL and build dependencies for pg native bindings
RUN apt-get update -y && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and prisma config
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client (outputs to src/generated/prisma)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --config prisma/prisma.config.ts

# Copy source code
COPY . .

# Build
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install OpenSSL for runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

# Generate Prisma client for production
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --config prisma/prisma.config.ts

# Copy built app (includes compiled generated prisma in dist/src/generated)
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 9001

# Start command
CMD ["node", "dist/src/main"]
