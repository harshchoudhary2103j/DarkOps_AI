# Multi-stage build for Operations Dashboard
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

USER appuser

EXPOSE 5173

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5173/ || exit 1

CMD ["npm", "run", "preview"]
