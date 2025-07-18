
# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

# Set working directory
WORKDIR /app

# Install dependencies as non-root user
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source code
COPY . .


# Use the built-in non-root 'node' user for security
USER node

# Set NODE_ENV to production
ENV NODE_ENV=production

# Expose port if needed (uncomment if your app serves HTTP)
# EXPOSE 3000

# Run the app using native TypeScript support
CMD ["node", "--experimental-transform-types", "src/index.ts"]
