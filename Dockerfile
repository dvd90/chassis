# ── Build stage ──────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
# A freshly scaffolded project has no lockfile: the CLI strips the template's,
# because it describes dependencies the project may not have kept. Use `npm ci`
# once one exists — reproducible — and fall back before then. In a workspaces
# monorepo the lockfile lives at the repo root, outside this build context, so
# this branch is what makes `docker build ./apps/api` work at all.
RUN if [ -f package-lock.json ]; then \
      npm ci --ignore-scripts; \
    else \
      npm install --ignore-scripts; \
    fi

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 8000
CMD ["node", "dist/server.js"]
