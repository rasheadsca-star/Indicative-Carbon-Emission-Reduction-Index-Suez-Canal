FROM node:22-bookworm-slim
WORKDIR /srv/ceri
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY backend ./backend
COPY ais-lab/core.mjs ./ais-lab/core.mjs
RUN mkdir -p /var/lib/ceri-ais && chown -R node:node /var/lib/ceri-ais
USER node
ENV AIS_PRIVATE_DATA_DIR=/var/lib/ceri-ais
HEALTHCHECK --interval=120s --timeout=10s --start-period=180s --retries=3 CMD ["node","backend/trial-healthcheck.mjs"]
CMD ["node","backend/trial-collector.mjs"]
