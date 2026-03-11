# FYP Demo 代码结构说明（2026-03-11）

本文档对应当前代码现状，便于快速定位模块与职责。

## 1. 根目录

1. `/Users/apple/Desktop/fyp_demo/UI 2`
- 主前端页面与交互逻辑。

2. `/Users/apple/Desktop/fyp_demo/camera1`
- 后端服务（Express + PostgreSQL）与 Python 计算引擎。

3. `/Users/apple/Desktop/fyp_demo/README.md`
- 项目运行说明（面向使用者）。

4. `/Users/apple/Desktop/fyp_demo/README_代码结构说明.md`
- 当前文件（面向开发者）。

5. `/Users/apple/Desktop/fyp_demo/Dockerfile`
- 线上容器部署入口（Node + Python 同镜像）。

6. `/Users/apple/Desktop/fyp_demo/render.yaml`
- Render Blueprint 配置（Web + PostgreSQL）。

7. `/Users/apple/Desktop/fyp_demo/docker-compose.yml`
- 本地容器化一键运行配置。

## 2. 前端（UI 2）

1. `/Users/apple/Desktop/fyp_demo/UI 2/index.html`
- 页面骨架：Dashboard、Map View、Route Planner、Weather、Alerts、Auth。

2. `/Users/apple/Desktop/fyp_demo/UI 2/styles.css`
- 全局样式。

3. `/Users/apple/Desktop/fyp_demo/UI 2/script.js`
- 核心前端逻辑：
  - 登录注册与会话联动
  - 摄像头/事故渲染
  - 路径规划调用后端 `/api/route-plan`
  - 管理员模拟路线
  - Alerts 与 Alert Detail
  - 资讯栏（近 7 天新闻 + 最新规则）

## 3. 后端（camera1）

1. `/Users/apple/Desktop/fyp_demo/camera1/server.js`
- Node 主服务，负责：
  - 认证与会话（PostgreSQL）
  - 摄像头/事故/天气/地理编码 API
  - 路径规划 API：`POST /api/route-plan`
  - AI 摘要接口与资讯流聚合
  - 限流、日志追踪、缓存与回退

2. `/Users/apple/Desktop/fyp_demo/camera1/py/compute_engine.py`
- Python 计算引擎：
  - `plan_routes`：A* 三策略路线
  - `enrich_incidents_with_cameras`：事故匹配最近摄像头

3. `/Users/apple/Desktop/fyp_demo/camera1/config.js`
- 基础配置（端口等）。

4. `/Users/apple/Desktop/fyp_demo/camera1/.env`
- 环境变量（数据库、API key、SMTP、Python 命令）。

5. `/Users/apple/Desktop/fyp_demo/camera1/package.json`
- Node 依赖与启动脚本。

## 4. 数据与文档

1. `/Users/apple/Desktop/fyp_demo/camera1/data/incident_api_mock.json`
- 管理员模拟事故数据。

2. `/Users/apple/Desktop/fyp_demo/camera1/data/LTATrafficSignalAspectGEOJSON.geojson`
- 信号点位数据源（红绿灯统计）。

3. `/Users/apple/Desktop/fyp_demo/camera1/docs/*.md`
- 摄像头实现、A* 实现、路由运行说明。

## 5. public 目录现状

1. `/Users/apple/Desktop/fyp_demo/camera1/public` 当前为空（旧页面已移除）。
2. `server.js` 仍保留 `express.static(public)` 挂载，但当前主流程使用 `/ui2`。

## 6. 主运行入口

1. 启动：

```bash
cd /Users/apple/Desktop/fyp_demo/camera1
npm start
```

2. 访问：

- `http://localhost:3000/ui2/`

## 7. 主要 API（当前）

1. `GET /api/cameras`
2. `GET /api/incidents`
3. `GET /api/geocode`
4. `POST /api/route-plan`
5. `GET /api/weather/current`
6. `GET /api/weather/forecast`
7. `POST /api/ai/incident-summary`
8. `GET /api/traffic-info-feed`
