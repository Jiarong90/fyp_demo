# A* 寻路实现指南（新版：后端 Python 统一计算）

本文档对应当前版本：路径规划已从前端本地计算切换为后端 Python 计算，前端只负责输入、展示与交互。

## 1. 当前实现结论

1. 前端路径规划统一调用 `POST /api/route-plan`。
2. A* 算法在 `camera1/py/compute_engine.py` 中实现。
3. 返回三条路线：`fastest`、`fewerLights`、`balanced`。
4. 管理员模拟路线也复用同一后端接口，保证算法一致。

## 2. 代码位置

- 前端入口：`/Users/apple/Desktop/fyp_demo/UI 2/script.js`
  - `fetchRoutePlansFromPython(...)`
  - `calculateRoutes()`
  - `buildStandaloneSimulation()`
- 后端 API：`/Users/apple/Desktop/fyp_demo/camera1/server.js`
  - `app.post('/api/route-plan', ...)`
- Python 算法：`/Users/apple/Desktop/fyp_demo/camera1/py/compute_engine.py`
  - `plan_routes(payload)`
  - `a_star(...)`

## 3. API 流程

1. 前端通过 `/api/geocode` 把起点/终点（邮编、地名、MRT）解析为经纬度。
2. 前端调用 `/api/route-plan` 提交 `start/end`。
3. 后端根据起终点自动计算 bbox，并向 Overpass 拉取道路数据。
4. 后端加载信号点位（LTA GeoJSON）作为红绿灯计数输入。
5. 后端调用 Python `plan_routes` 返回三条方案。
6. 前端按时间排序展示，并结合事故评估更新“当前最快”。

## 4. A* 与权重策略（与旧逻辑保持一致）

### 4.1 图构建

- 节点合并规则：经纬度四舍五入到小数点后 4 位（`node_key`）。
- 边权重基础值：`distance(km) / 40`（小时）。
- 道路来自 Overpass 的 `way.geometry`，双向建边。

### 4.2 启发函数

- `h(n) = Haversine(n, end) / 1000 / 50`（小时）。

### 4.3 三类策略

1. `fastest`：基础时间优先，叠加少量重复边惩罚。
2. `fewerLights`：对路口（度数>=3）增加更高惩罚，降低红绿灯等待。
3. `balanced`：介于两者之间。

### 4.4 红绿灯计数

- 优先使用真实信号点位：
  - 路径附近半径匹配（默认 35m）
  - 去重聚类半径（默认 65m）
- 若信号点命中不足，再退回“节点度数法”估算。

## 5. /api/route-plan 接口说明

### 5.1 请求

```http
POST /api/route-plan
Content-Type: application/json
```

```json
{
  "start": { "lat": 1.3521, "lon": 103.8198 },
  "end": { "lat": 1.3009, "lon": 103.8452 },
  "paddingDeg": 0.03
}
```

### 5.2 响应（简化）

```json
{
  "routes": [
    {
      "id": "fastest",
      "label": "FASTEST",
      "color": "#2563eb",
      "desc": "Prioritize total time",
      "totalDist": 12345.6,
      "estMinutes": 22.1,
      "trafficLights": 19,
      "coords": [[1.35,103.82],[1.34,103.83]]
    }
  ],
  "meta": {
    "engine": "python",
    "signalCount": 2000,
    "generatedAt": "2026-03-09T...Z"
  }
}
```

## 6. 前端接入方式（当前状态）

前端已完成切换：

1. 普通路径规划：`calculateRoutes()` -> `fetchRoutePlansFromPython()`
2. 管理员模拟路线：`buildStandaloneSimulation()` -> `fetchRoutePlansFromPython()`
3. 地图绘制直接用后端返回 `coords`。

## 7. 运行要求

1. Node 18+
2. Python 3+
3. PostgreSQL 可连接（与导航算法本身无耦合，但服务启动需要）

建议 `.env`：

```env
PYTHON_BIN=python3
DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/fyp_demo
```

## 8. 本地验证

```bash
cd /Users/apple/Desktop/fyp_demo/camera1
npm start
```

```bash
curl -X POST http://localhost:3000/api/route-plan \
  -H "Content-Type: application/json" \
  -d '{"start":{"lat":1.3521,"lon":103.8198},"end":{"lat":1.3009,"lon":103.8452}}'
```

## 9. 已知限制

1. Overpass 网络波动会影响路由响应时间。
2. 目前未接入道路封闭/匝道限制等更细粒度交通规则。
3. 路况延误仍在前端按事故叠加评估，不改变 Python 基础路径本体。
