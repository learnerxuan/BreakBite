FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY scripts/assets.mjs ./scripts/assets.mjs
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production AUTH_MODE=local STORE=file HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data COOKIE_SECURE=true
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8080
CMD ["node", "dist/server/index.js"]
