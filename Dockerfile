FROM node:20-slim AS base

RUN mkdir -p /data /home/node/app \
    && chown -R node:node /data /home/node

USER node
WORKDIR /home/node/app

COPY --chown=node:node package.json package-lock.json ./

# ---- dev: full deps (incl. nodemon), source is bind-mounted at runtime by
# docker-compose.local.yaml — nothing copied here on purpose, the mount
# supplies it. Used for local dev, never for a real deploy.
FROM base AS dev
RUN npm ci
ENV PORT=7860 \
    CONFIG_DATA_DIR=/data
EXPOSE 7860
# --legacy-watch (polling): a bind mount from a Windows host doesn't deliver
# inotify events into the Linux container, so nodemon's default watcher never
# fires — polling is slower but actually works cross-platform.
CMD ["npx", "nodemon", "--legacy-watch", "addon.js"]

# ---- production (default target — last stage wins when no `target:` is set,
# which is what docker-compose.yaml relies on): lean deps, code baked in.
FROM base AS production
RUN npm ci --omit=dev

COPY --chown=node:node . .

ENV NODE_ENV=production \
    PORT=7860 \
    CONFIG_DATA_DIR=/data
EXPOSE 7860

CMD ["node", "addon.js"]
