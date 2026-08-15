# Multi-stage build for Railway. Prisma 7's driver-adapter client (@prisma/adapter-pg)
# is pure JS — no native query-engine binary to cross-compile for Alpine's
# musl libc, which is what made older Prisma + Docker setups painful.
#
# build-ca/ (see .gitignore) is normally just an empty directory (kept via
# .gitkeep) — on Railway's real build servers it stays empty and this is a
# no-op. It exists so a sandboxed CI environment sitting behind a
# TLS-intercepting proxy can drop an extra CA cert in there to get `npm ci`
# past registry fetches; nothing from it is copied into the final `runner`
# stage.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema present —
# copy it before `npm ci`, not after.
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY build-ca/ /tmp/build-ca/
ENV NODE_EXTRA_CA_CERTS=/tmp/extra-ca.crt
RUN touch /tmp/extra-ca.crt; \
    for f in /tmp/build-ca/*.crt; do \
      [ -f "$f" ] && cat "$f" >> /tmp/extra-ca.crt; \
    done 2>/dev/null; \
    npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY build-ca/ /tmp/build-ca/
ENV NODE_EXTRA_CA_CERTS=/tmp/extra-ca.crt
RUN touch /tmp/extra-ca.crt; \
    for f in /tmp/build-ca/*.crt; do \
      [ -f "$f" ] && cat "$f" >> /tmp/extra-ca.crt; \
    done 2>/dev/null; \
    true
# DATABASE_URL isn't needed to build (no DB connection happens at build
# time), but prisma generate reads schema.prisma to produce the client.
# next/font/google fetches font files at build time — needs the same CA
# trust as the deps stage in a proxied/sandboxed CI environment; a no-op
# on Railway's real build servers where build-ca/ is empty.
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone output: a self-contained server + only the node_modules it
# actually traced as used — not the full node_modules tree.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Needed at container start (not at build time): applying pending
# migrations against whatever Postgres Railway wires up via DATABASE_URL.
# The Prisma CLI's dependency tree (@prisma/config, effect, and friends)
# isn't traced into .next/standalone since it's only used at container
# start, not imported by the compiled server — so copy the full deps-stage
# node_modules instead of hand-picking packages one failed require at a
# time. Not using the node_modules/.bin/prisma symlink — Docker COPY
# dereferences it into a plain file, which breaks its own relative
# require("./cli.js"). Invoke the real entrypoint directly instead (see CMD).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Apply pending migrations, then start the server. Safe to run on every
# deploy/restart — `migrate deploy` is a no-op when nothing's pending.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
