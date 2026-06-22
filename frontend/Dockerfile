# ─── Stage 1: builder ────────────────────────────────────────────────────────
# Builds the Vite production bundle. This stage is discarded after — only
# the compiled static files go into the final image.
FROM node:22-alpine AS builder

WORKDIR /app

# Layer-cache npm install separately from source so it only re-runs on
# package.json / package-lock.json changes, not on every code change.
COPY package*.json ./
RUN npm ci

# Bake API URLs into the bundle at build time.
#
# VITE_API_URL: REST base URL the browser calls.
#   Default = /api (relative) so nginx proxies it transparently.
#   Override at build time with --build-arg VITE_API_URL=https://api.example.com
#   if you want a cross-origin setup.
#
# VITE_WS_URL: WebSocket base URL.
#   Default = "" (empty string) means useSocket.ts derives it from window.location
#   at runtime (ws://same-host/ws), which works through the nginx proxy.
#   Override with --build-arg VITE_WS_URL=ws://localhost:8080 for local dev builds.
ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY . .
RUN npm run build


# ─── Stage 2: runner ─────────────────────────────────────────────────────────
# Serves the compiled bundle. nginx:alpine is ~25 MB and handles thousands of
# concurrent static file requests with minimal CPU/memory.
FROM nginx:1.27-alpine AS runner

# Replace the default nginx config with our tuned version that adds:
# - SPA fallback (React Router)
# - /ws WebSocket proxy → backend
# - /api REST proxy → backend
# - gzip + security headers + asset caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled Vite bundle
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx default CMD is fine: nginx -g "daemon off;"
