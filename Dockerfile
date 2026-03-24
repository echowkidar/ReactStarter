# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Sirf required files copy karo (clean image)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Production dependencies only
RUN npm install --omit=dev

EXPOSE 5001

CMD ["node", "dist/index.js"]