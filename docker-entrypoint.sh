#!/bin/sh
set -e

# 确保持久卷上的上传目录存在
mkdir -p /data/uploads

echo "[entrypoint] 初始化数据库（prisma db push）..."
npx prisma db push --skip-generate --accept-data-loss || echo "[entrypoint] db push 失败，继续启动"

echo "[entrypoint] 启动 Next.js 服务..."
exec npx next start -p "${PORT:-3000}"
