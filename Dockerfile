# Install dependencies and build client
FROM node:20 AS builder

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

# Production image
FROM node:20

WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/index.js"]
