# ---- 构建阶段 ----
# 用 Debian（glibc）而非 alpine：运行阶段要装 Python 依赖（pypdf/pdfplumber），
# Debian 有现成的 manylinux 轮子，避免 musl 上编译失败；且 Prisma 引擎与宿主 libc 一致。
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---- 运行阶段 ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# 持久卷上的数据库与上传目录（docker-compose 挂载 ./data → /data）
ENV DATABASE_URL="file:/data/dev.db"
ENV UPLOAD_DIR="/data/uploads"
# Python 运行时：供 scripts/parse_pdf_meta.py 与 scripts/parse_schedule.py 调用
# （路由默认找 PATH 里的 python3，无需额外配 PDF_META_PYTHON/COURSE_PARSER_PYTHON）
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl ca-certificates python3 python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages pypdf pdfplumber python-docx

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# 关键：Python 解析脚本必须进镜像，否则导入功能会报找不到文件
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
