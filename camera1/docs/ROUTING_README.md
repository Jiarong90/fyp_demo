# ROUTING README（当前可运行版本）

本文件用于快速让开发者在当前项目中跑通导航功能（`/ui2`），并理解与导航相关的后端与 Python 计算链路。

## 1. 适用范围

- 适用页面：`http://localhost:3000/ui2/`
- 不再适用旧页面：`public/routing.html`（已移除）

## 2. 导航相关文件

1. 前端导航交互：`/Users/apple/Desktop/fyp_demo/UI 2/script.js`
2. 后端路由 API：`/Users/apple/Desktop/fyp_demo/camera1/server.js`
3. Python 算法引擎：`/Users/apple/Desktop/fyp_demo/camera1/py/compute_engine.py`

## 3. 关键接口

### 3.1 地理编码

- `GET /api/geocode?q=<postal|place|mrt>`
- 支持邮编、地名、MRT 关键字。

### 3.2 路线规划（核心）

- `POST /api/route-plan`
- 输入起终点经纬度，返回三条候选路线。

### 3.3 道路数据（调试用）

- `GET /api/roads?minLat=...&minLon=...&maxLat=...&maxLon=...`
- 主要给调试和排障使用，业务主流程已走 `/api/route-plan`。

## 4. 运行步骤

1. 进入后端目录

```bash
cd /Users/apple/Desktop/fyp_demo/camera1
```

2. 配置环境变量（至少数据库 + Python）

```bash
export DATABASE_URL="postgresql://<user>:<pass>@localhost:5432/fyp_demo"
export PYTHON_BIN="python3"
```

3. 启动服务

```bash
npm start
```

4. 打开页面

```text
http://localhost:3000/ui2/
```

## 5. 快速自检

### 5.1 检查 Python 是否可调用

```bash
python3 -m py_compile /Users/apple/Desktop/fyp_demo/camera1/py/compute_engine.py
```

### 5.2 检查 route-plan 接口

```bash
curl -X POST http://localhost:3000/api/route-plan \
  -H "Content-Type: application/json" \
  -d '{"start":{"lat":1.3521,"lon":103.8198},"end":{"lat":1.3009,"lon":103.8452}}'
```

预期：返回 `routes` 数组，至少包含 2~3 条方案（视路网可达性）。

## 6. 当前策略说明

返回路线固定为三类：

1. `fastest`：时间优先
2. `fewerLights`：少红绿灯优先
3. `balanced`：均衡策略

前端最终会基于事故附加延误做二次排序，显示“当前最快”。

## 7. 常见问题

1. `Python 计算失败`：检查 `PYTHON_BIN` 是否可执行，或直接用 `python3`。
2. `No valid route plan generated`：起终点可能超出可连通路网，尝试换点位。
3. `Overpass API 错误`：外部网络或限流问题，稍后重试。
4. 页面有路线但体验卡顿：通常是路网区域过大，可降低 `paddingDeg`。

## 8. 后续扩展建议

1. 将 Python 计算改为常驻服务（FastAPI）以减少子进程开销。
2. 增加路线级缓存（按起终点网格化 key）。
3. 接入更细粒度道路限制（单行、临时封路、施工管制）。
