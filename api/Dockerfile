# syntax=docker/dockerfile:1.4
FROM node:24-alpine3.22 AS base
# Bound every native tool's scratch space inside /tmp (mounted as tmpfs
# at runtime). No native tool may write to the writable layer (HOME,
# XDG_*, npm cache). Prevents the LibreOffice profile drift that caused
# the 414 GB container writable layer incident.
ENV HOME=/tmp/home \
    XDG_CONFIG_HOME=/tmp/xdg-config \
    XDG_CACHE_HOME=/tmp/xdg-cache \
    XDG_DATA_HOME=/tmp/xdg-data \
    TMPDIR=/tmp \
    MAGICK_TMPDIR=/tmp \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    SAL_USE_VCLPLUGIN=svp
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
# Same scratch-space confinement as the base stage.
ENV HOME=/tmp/home \
    XDG_CONFIG_HOME=/tmp/xdg-config \
    XDG_CACHE_HOME=/tmp/xdg-cache \
    XDG_DATA_HOME=/tmp/xdg-data \
    TMPDIR=/tmp \
    MAGICK_TMPDIR=/tmp \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    SAL_USE_VCLPLUGIN=svp
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
