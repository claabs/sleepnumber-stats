FROM node:24-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies, snooze, tzdata, and cronie (crond)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
    && apk add --no-cache tzdata supercronic

# Copy source code
COPY . .

# Use the built-in non-root 'node' user for security
USER node

RUN echo "15 10 * * * node --experimental-transform-types /app/src/index.ts" >> /home/node/crontab

# Set NODE_ENV to production
ENV NODE_ENV=production

# Start crond in foreground
CMD ["supercronic", "-no-reap", "-passthrough-logs", "/home/node/crontab"]
