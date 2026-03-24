# =========================
# Build stage
# =========================
FROM node:20 AS builder

WORKDIR /app

# Install build dependencies (for canvas etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build project
RUN npm run build


# =========================
# Production stage
# =========================
FROM node:20

WORKDIR /app

# Copy only required files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client ./client
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/theme.json ./theme.json

# Install dependencies (including vite if needed)
RUN npm install

# 🔥 VERY IMPORTANT (fixes blank screen issue)
ENV NODE_ENV=production

# Expose port
EXPOSE 5001

# Start app
CMD ["node", "dist/index.js"]