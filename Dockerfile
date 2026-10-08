FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev
COPY api-gateway ./api-gateway
COPY services ./services
COPY shared ./shared

ENV NODE_ENV=production
CMD ["node", "api-gateway/src/server.js"]
