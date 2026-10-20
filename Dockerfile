# BoardingFinder API
FROM node:20-bookworm-slim

# rclone is used to store listing photos / private ID documents on Google Drive
RUN apt-get update \
 && apt-get install -y --no-install-recommends rclone ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Private uploads (local fallback storage) must persist — mount a volume here
RUN mkdir -p /app/uploads && chown -R node:node /app
VOLUME ["/app/uploads"]

USER node
EXPOSE 5000
CMD ["node", "server.js"]
