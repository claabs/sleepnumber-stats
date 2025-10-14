FROM node:24-alpine AS base

# Set working directory
WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production CONFIG_PATH=/app/config

# Install dependencies, snooze, tzdata, and cronie (crond)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
    && apk add --no-cache tzdata supercronic

# Copy source code
COPY . .

# Use the built-in non-root 'node' user for security
USER node

ENTRYPOINT ["/app/docker-entrypoint.sh"]
