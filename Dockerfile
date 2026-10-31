# =========================
# Build stage
# =========================
FROM node:20 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# =========================
# Production stage
# =========================
FROM node:20
WORKDIR /app
# Runtime libraries needed by `canvas` (PDF/image features)
RUN apt-get update && apt-get install -y \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/theme.json ./theme.json
ENV NODE_ENV=production
ENV PORT=5001
EXPOSE 5001
# uploads live in a mounted volume (see docker-compose.yml)
RUN mkdir -p /app/uploads
CMD ["node", "dist/index.js"]
