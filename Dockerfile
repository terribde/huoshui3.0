# 阶段 1: 构建生产静态资源
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package.json package-lock.json* bun.lock* ./
RUN npm install

# 复制项目源代码并构建
COPY . .
RUN npm run build

# 阶段 2: 使用轻量级 Nginx 镜像对外提供服务
FROM nginx:alpine

# 复制打包后的静态文件到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制自定义 Nginx 配置文件 (包含 SPA 路由转发与 Gzip 优化)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
