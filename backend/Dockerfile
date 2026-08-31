# syntax=docker/dockerfile:1

# ---------- Stage 1: dependencies ----------
# Installs the full dependency tree (including devDependencies) so TypeScript
# is available for the build stage.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage 2: build ----------
# Generates the Prisma Client from the schema, then compiles TS -> dist/.
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npx tsc

# ---------- Stage 3: runtime ----------
# Ships only production dependencies plus the compiled output. `prisma` and
# `tsx` are runtime dependencies on purpose: the container runs
# `prisma migrate deploy` on startup and `prisma db seed` on demand.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma7.config.ts ./
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
# The TS sources (incl. the generated Prisma Client) come along so that
# `prisma db seed`, which runs prisma/seed.ts through tsx, works in-container.
COPY --from=build /app/src ./src

# Run as the unprivileged user that the node image already provides.
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]
