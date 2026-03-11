FROM node:20-bookworm-slim

# 安装 Python（供 Node.js 子进程调用 compute_engine.py）
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先拷贝依赖清单，利用 Docker 缓存加速构建
COPY camera1/package.json camera1/package-lock.json /app/camera1/
WORKDIR /app/camera1
RUN npm ci --omit=dev

# 再拷贝业务代码
WORKDIR /app
COPY camera1 /app/camera1
COPY ["UI 2", "/app/UI 2"]

ENV NODE_ENV=production
ENV PYTHON_BIN=python3

EXPOSE 3000

WORKDIR /app/camera1
CMD ["npm", "start"]
