# syntax=docker/dockerfile:1.4
FROM node:24-alpine3.22 AS base
# Bound every native tool's scratch space inside /tmp (mounted as tmpfs at runtime).
# No native tool may write to the writable layer (HOME, XDG_*, npm cache).
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
RUN apk add --no-cache \
    fontconfig \
    font-noto \
    font-noto-cjk \
    font-opensans \
    font-inter \
    poppler-utils \
    libreoffice-writer \
    pandoc \
    ttf-dejavu \
    ttf-liberation \
    curl
# Install Lato from Google Fonts upstream for Celestial template rendering
RUN mkdir -p /usr/share/fonts/lato && \
    cd /usr/share/fonts/lato && \
    curl -fsSL -o Lato-Regular.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf && \
    curl -fsSL -o Lato-Bold.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-Bold.ttf && \
    curl -fsSL -o Lato-Italic.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-Italic.ttf && \
    curl -fsSL -o Lato-BoldItalic.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-BoldItalic.ttf && \
    fc-cache -f
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
# Same scratch-space confinement as the base stage — keep native tools out of the writable layer.
ENV HOME=/tmp/home \
    XDG_CONFIG_HOME=/tmp/xdg-config \
    XDG_CACHE_HOME=/tmp/xdg-cache \
    XDG_DATA_HOME=/tmp/xdg-data \
    TMPDIR=/tmp \
    MAGICK_TMPDIR=/tmp \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    SAL_USE_VCLPLUGIN=svp
RUN npm install -g npm@latest
RUN apk add --no-cache \
    fontconfig \
    font-noto \
    font-noto-cjk \
    font-opensans \
    font-inter \
    poppler-utils \
    libreoffice-writer \
    pandoc \
    ttf-dejavu \
    ttf-liberation \
    curl
# Install Lato from Google Fonts upstream for Celestial template rendering
RUN mkdir -p /usr/share/fonts/lato && \
    cd /usr/share/fonts/lato && \
    curl -fsSL -o Lato-Regular.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf && \
    curl -fsSL -o Lato-Bold.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-Bold.ttf && \
    curl -fsSL -o Lato-Italic.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-Italic.ttf && \
    curl -fsSL -o Lato-BoldItalic.ttf https://github.com/google/fonts/raw/main/ofl/lato/Lato-BoldItalic.ttf && \
    fc-cache -f
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
