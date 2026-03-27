# wxWebHook-panel

![wxWebHook-panel](https://socialify.git.ci/aristorechina/wxWebHook-panel/image?font=Rokkitt&language=1&name=1&owner=1&pattern=Circuit+Board&theme=Dark)

本仓库是 [![GitHub](https://img.shields.io/badge/Github-wxWebHook-181716?style=plastic&logo=github&logoColor=white)](https://github.com/aristorechina/wxWebHook) 的一部分。

`wxWebHook-panel` 是 `wxWebHook-core` 的前端管理面板，提供一个可视化控制台用于完成微信接入、Webhook 配置、消息查看和测试消息发送。

后端见  [![GitHub](https://img.shields.io/badge/Github-wxWebHook--core-181716?style=plastic&logo=github&logoColor=white)](https://github.com/aristorechina/wxWebHook-core)

## 运行方式

### 环境要求

- Node.js `20+`
- npm `10+`
- 已启动后端 `wxWebHook-core`

### 安装与启动

```bash
npm install
npm run dev
```

默认访问地址：`http://localhost:5173`

### 构建

```bash
npm run build
npm run preview
```

## 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:18731` | 后端 API 根地址 |

示例 `.env.local`：

```bash
VITE_API_BASE_URL=http://localhost:18731
```

注意：后端 `WXWEBHOOK_PANEL_ORIGIN` 必须与前端实际访问 Origin 完全一致，否则会被 CORS 拦截。
