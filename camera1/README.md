# 新加坡交通监控摄像头 Singapore Traffic Cameras

实时查看新加坡各路段交通监控摄像头的 Web 应用。

## 功能

-  新加坡全岛地图（OneMap 底图）
-  显示所有可用的 LTA 交通摄像头位置
-  点击标记查看实时摄像头画面
-  搜索和筛选摄像头位置
-  一键刷新最新数据

## 快速开始 Start
终端进入（根据位置自己改）Terminal Entry
cd /Users/apple/Desktop/camera
```bash
# 安装依赖
npm install

# 启动服务 Start 
npm start
```

访问 http://localhost:3000

## 技术栈

- 后端: Node.js + Express
- 前端: Leaflet.js + OneMap 新加坡底图
- 数据: [data.gov.sg Traffic Images API](https://api.data.gov.sg/v1/transport/traffic-images)（公开接口，无需 API Key）
