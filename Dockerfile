# Build stage
FROM node:20 AS builder

WORKDIR /app

# Install required build tools (IMPORTANT)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm install --omit=dev

EXPOSE 5001

CMD ["node", "dist/index.js"]