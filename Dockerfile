# ---- 构建阶段 ----
# 用 Debian（glibc）而非 alpine：运行阶段要装 Python 依赖（pypdf/pdfplumber），
# Debian 有现成的 manylinux 轮子，避免 musl 上编译失败；且 Prisma 引擎与宿主 libc 一致。
FROM node:20-bookworm-slim AS builder
WORKDIR /app
# 国内网络加速：apt / npm / Prisma 引擎
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# next-auth@4 的 peer 依赖要求 react@^18，本项目为 React 19 → 需 --legacy-peer-deps
RUN npm install --legacy-peer-deps --registry=https://registry.npmmirror.com
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 构建期也要有 DATABASE_URL：prisma generate 与（可能的）静态生成都需要；
# 用一个临时空库，避免 build 时因连不上数据库失败。
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate
RUN npx prisma db push --skip-generate --accept-data-loss \
 && npm run build

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
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl ca-certificates python3 python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages \
      -i https://pypi.tuna.tsinghua.edu.cn/simple \
      pypdf pdfplumber python-docx

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
