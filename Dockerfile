# ── Stage 1: 安装依赖 ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# ── Stage 2: 最终运行镜像 ──────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

# 只复制运行时需要的内容，不带 Dockerfile / .git / scripts 等
COPY --from=deps /app/node_modules ./node_modules
COPY src/     ./src/
COPY public/  ./public/
COPY config/  ./config/
COPY package.json ./

RUN mkdir -p /data/cache

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health >/dev/null || exit 1

CMD ["node", "src/index.js"]
