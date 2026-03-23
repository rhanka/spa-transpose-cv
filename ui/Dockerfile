# syntax=docker/dockerfile:1.4
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

FROM base AS development
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS build
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.29-alpine AS production
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
