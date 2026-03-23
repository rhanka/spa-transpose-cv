# syntax=docker/dockerfile:1.4
FROM node:24-alpine3.22 AS base
RUN npm install -g npm@latest
# System deps for CV text extraction
RUN apk add --no-cache poppler-utils pandoc libreoffice-writer
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm install; fi
COPY . .

FROM base AS development
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm run build

FROM node:24-alpine3.22 AS production
RUN npm install -g npm@latest
RUN apk add --no-cache poppler-utils pandoc libreoffice-writer
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/package.json ./
COPY --from=base /app/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Template and toolkit files
COPY --from=base /app/templates ./templates
RUN mkdir -p /data
CMD ["node", "dist/index.js"]
