# Build stage
FROM node:20 AS builder

WORKDIR /app

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
COPY --from=builder /app/client ./client   # 🔥 ADD THIS
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/theme.json ./theme.json

RUN npm install

EXPOSE 5001

CMD ["node", "dist/index.js"]