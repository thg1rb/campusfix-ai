FROM oven/bun:1.4.5 AS bun
FROM node:24.22.3-bookworm-slim AS development
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --chown=node:node . .
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["bun", "run", "dev", "--hostname", "0.0.0.0"]

FROM development AS runtime
RUN API_BASE_URL=http://api:8080 bun run build
ENV NODE_ENV=production
CMD ["bun", "run", "start", "--hostname", "0.0.0.0"]
