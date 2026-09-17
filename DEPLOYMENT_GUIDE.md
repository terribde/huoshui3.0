# 西南交通大学专属评教系统 - 公网服务器部署指南

本项目采用 **React 18 + Vite + Tailwind CSS + Supabase 云端数据库** 架构。数据库已托管在 Supabase 云端，因此您的公网服务器只需要部署前端静态页面即可，**占用内存极低（不到 20MB），访问速度极快**。

---

## 准备工作：云服务器安全组开通端口
登录您的阿里云 / 腾讯云 / 华为云等控制台，进入安全组（防火墙），放行以下入方向端口：
- **80 端口**（HTTP 网页访问，必须）
- **443 端口**（HTTPS 证书访问，如果配置域名推荐开通）
- **22 端口**（SSH 远程登录）

---

## 方案一：Docker 一键部署（最简单、最推荐）

如果您的服务器上安装了 Docker，这是最快速、环境最隔离的部署方案。

### 1. 将项目代码上传到服务器
您可以通过 git 克隆，或通过 SCP / Xftp 将整个项目文件夹上传至服务器，例如 `/root/swjtu-eval`：
```bash
cd /root/swjtu-eval
```

### 2. 构建并启动容器
在项目目录下执行：
```bash
docker compose up -d --build
```
> 或者使用传统 docker 命令：
> ```bash
> docker build -t swjtu-eval .
> docker run -d -p 80:80 --name swjtu-eval-app --restart always swjtu-eval
> ```

### 3. 验证访问
启动完成后，直接在浏览器地址栏输入您的 **服务器公网 IP**（如 `http://123.45.67.89`），即可看到评教系统！

---

## 方案二：传统 Nginx 静态文件部署（省内存、原生性能最高）

如果您的服务器使用原生的 Ubuntu / Debian / CentOS，可以直接用 Nginx 托管。

### 1. 在服务器或本地编译打包
在项目目录下执行打包命令：
```bash
npm install
npm run build
```
执行完毕后，会在项目根目录生成一个 `dist/` 文件夹，里面就是所有的网页静态文件。

### 2. 服务器安装 Nginx
- **Ubuntu / Debian**:
  ```bash
  sudo apt update
  sudo apt install -y nginx
  ```
- **CentOS / Rocky Linux**:
  ```bash
  sudo yum install -y nginx
  sudo systemctl enable nginx
  sudo systemctl start nginx
  ```

### 3. 上传 dist 目录到服务器
将生成的 `dist` 目录内容上传到服务器的 `/var/www/swjtu-eval` 目录下：
```bash
sudo mkdir -p /var/www/swjtu-eval
# 将 dist 下的所有文件上传到该目录下
```

### 4. 配置 Nginx 站点
编辑 Nginx 配置文件：
```bash
sudo nano /etc/nginx/conf.d/swjtu-eval.conf
```
粘贴以下配置（如果已有默认 default 配置可先备份或注释）：
```nginx
server {
    listen 80;
    server_name your-domain.com; # 没有域名填 _ 或你的公网 IP

    root /var/www/swjtu-eval;
    index index.html;

    # Gzip 压缩加速
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # 关键：React SPA 单页应用路由转发，防止刷新报 404
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长期缓存优化
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

测试并重启 Nginx：
```bash
sudo nginx -t
sudo systemctl restart nginx
```

---

## 方案三：宝塔面板 / 1Panel 部署（有可视化面板的首选）

如果您服务器安装了宝塔面板或 1Panel：
1. 本地执行 `npm run build` 生成 `dist` 文件夹，将 `dist` 文件夹压缩为 `dist.zip`；
2. 登录宝塔面板，进入 **网站 -> 添加站点**；
3. 输入您的域名或公网 IP，根目录选择默认即可；
4. 进入该站点的根目录，上传并解压 `dist.zip`，把解压出的内容直接放到站点根目录下；
5. 进入站点设置 -> **伪静态**，粘贴以下规则并保存：
   ```nginx
   location / {
       try_files $uri $uri/ /index.html;
   }
   ```
6. 访问您的公网 IP 或域名即可。

---

## 域名与免费 SSL 证书配置（HTTPS）

如果您有域名（如 `eval.yourdomain.com`）：
1. 在域名 DNS 控制台添加一条 **A 记录**，将主机记录指向您的公网 IP；
2. 在服务器上使用 Certbot 免费申请 Let's Encrypt 证书：
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```
   按照提示输入邮箱后，Certbot 会自动帮您配置好 HTTPS 和证书自动续期。
