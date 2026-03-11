# FYP Demo（UI2 + camera1）

当前项目是新加坡交通监控与导航 Demo，主入口为：`http://localhost:3000/ui2/`。

## 1. 当前架构（与代码一致）

1. 前端：`/Users/apple/Desktop/fyp_demo/UI 2`
2. 后端：`/Users/apple/Desktop/fyp_demo/camera1/server.js`（Node.js + Express + PostgreSQL）
3. Python 计算：`/Users/apple/Desktop/fyp_demo/camera1/py/compute_engine.py`
   - 路径规划 A*（`/api/route-plan`）
   - 事故-摄像头最近匹配

## 2. 当前核心功能

1. 登录/注册/会话（PostgreSQL，邮箱验证码流程）
2. Dashboard 实时事故展示（支持按时间或严重度排序）
3. Map View 显示摄像头 + 实时事故点（按钮切换显示/隐藏）
4. 路径规划三策略：`fastest` / `fewerLights` / `balanced`
5. 管理员模拟路线与模拟事故，并联动 Alerts
6. Alerts `View Details` AI 摘要（通俗化原因说明）
7. Alerts 右侧资讯：最近 1 周事故新闻 + 最新交通规则更新

## 3. 环境要求

1. Node.js >= 18
2. Python 3
3. PostgreSQL（可连接）

## 4. 快速启动

### 4.1 安装依赖

```bash
cd /Users/apple/Desktop/fyp_demo/camera1
npm install
```

### 4.2 配置 `.env`

示例：

```env
PORT=3000
DATABASE_URL=postgresql://fyp_demo:你的数据库密码@localhost:5432/fyp_demo
PYTHON_BIN=python3

MAIL_DEV_MODE=true
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

LTA_ACCOUNT_KEY=
OPENWEATHER_API_KEY=
GEMINI_API_KEY=

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=180
AUTH_RATE_LIMIT_MAX=40
```

说明：

1. 开发阶段建议 `MAIL_DEV_MODE=true`（验证码走开发模式）。
2. 真实邮箱发送需配置 SMTP 并设为 `MAIL_DEV_MODE=false`。

### 4.3 启动

```bash
cd /Users/apple/Desktop/fyp_demo/camera1
npm start
```

打开：

- `http://localhost:3000/ui2/`

## 5. 关键接口（现行）

1. `GET /api/cameras`
2. `GET /api/incidents?source=live|mock&withImagesOnly=0|1&max=...`
3. `GET /api/geocode?q=...`
4. `POST /api/route-plan`
5. `GET /api/weather/current`
6. `GET /api/weather/forecast`
7. `POST /api/ai/incident-summary`
8. `GET /api/traffic-info-feed`

## 6. 重要说明

1. 路径规划已统一走后端 Python（前端只负责输入/渲染）。
2. 管理员模拟路线也复用 `/api/route-plan`。
3. `camera1/public` 旧页面文件已移除；项目保留 `express.static(public)` 但当前主流程不依赖该目录。

## 7. 常见问题

1. `password authentication failed`：检查 `DATABASE_URL` 用户名和密码。
2. `Python 路径规划失败`：检查 `python3` 可用性和 `PYTHON_BIN`。
3. `Overpass API 错误`：外部网络波动，稍后重试。
4. 验证码接收问题：开发阶段优先 `MAIL_DEV_MODE=true`。

## 8. 相关文档

1. `/Users/apple/Desktop/fyp_demo/camera1/docs/摄像头实现指南.md`
2. `/Users/apple/Desktop/fyp_demo/camera1/docs/A星寻路实现指南.md`
3. `/Users/apple/Desktop/fyp_demo/camera1/docs/ROUTING_README.md`

## 9. 部署（可持续发布）

本仓库已补齐以下部署文件：

1. `/Users/apple/Desktop/fyp_demo/Dockerfile`
2. `/Users/apple/Desktop/fyp_demo/.dockerignore`
3. `/Users/apple/Desktop/fyp_demo/render.yaml`
4. `/Users/apple/Desktop/fyp_demo/docker-compose.yml`

### 9.1 本地开发（非 Docker）

```bash
cd /Users/apple/Desktop/fyp_demo/camera1
npm install
npm start
```

访问：`http://localhost:3000/ui2/`

### 9.2 本地一键容器运行（Docker Compose）

```bash
cd /Users/apple/Desktop/fyp_demo
docker compose up --build
```

访问：`http://localhost:3000/ui2/`

### 9.3 线上部署（Render，推荐）

1. 把仓库推到 GitHub。
2. 在 Render 里选择 “Blueprint”，导入仓库。
3. Render 会自动识别根目录 `render.yaml`，创建：
   - Web Service（Docker）
   - PostgreSQL 数据库
4. 在 Render 后台补全你的 API Key（LTA/Weather/Gemini/SMTP）。
5. 每次 `git push` 后会自动重新构建并发布。
