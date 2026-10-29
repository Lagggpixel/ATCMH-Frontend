FROM node:24-alpine AS deps
WORKDIR /app
COPY --from=dependency-manifests package.json package-lock.json ./
# Speech runs in the browser; do not download unused native CUDA libraries.
RUN --mount=type=cache,id=atcmh-npm-linux-amd64,target=/root/.npm,sharing=locked ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=4096
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,id=atcmh-next-linux-amd64,target=/app/.next/cache,sharing=locked npm run build
RUN node src/simulator/build-maintenance.mjs

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/maintenance ./maintenance
COPY --chown=nextjs:nodejs storage ./storage
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
