# MiMo TTS HTTP Proxy

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://hub.docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

基于 MiMo TTS v2.5 的 HTTP 代理服务，为阅读 App（阅读/Legado/Gedoor/读不舍手）提供 TTS 声音源订阅，并附带完整的 Web 管理后台。

![管理后台截图](data/admin-screenshot.png)

---

## 功能

- **三种合成模型**：标准 TTS、声音设计（自然语言描述）、声音克隆（上传音频样本）
- **阅读 App 订阅源**：自动生成 `/api/reader/tts-configs` JSON，支持一键导入
- **AI 情感分析**：开启后自动向 MiMo 注入角色设定与提示词，让模型理解情感并添加语音标签
- **本地音频缓存**：相同请求复用，减少 API 调用
- **用量统计**：TTS 调用日志 + 可视化折线图（日/周/月，按模型分类）
- **完整管理后台** `/admin`：图标侧边栏、6 套主题 + 自选颜色、音色卡片选择、克隆音色管理

---

## 快速开始

### 方式一：Docker Compose（推荐）

**1. 准备配置文件**

```bash
cp docker-compose.nas.yml docker-compose.yml   # NAS/VPS 推荐
# 或直接编辑 docker-compose.yml
```

**2. 填写必要参数**

```yaml
environment:
  - MIMO_API_KEY=sk-xxxxx          # MiMo API Key（必填）
  - PUBLIC_BASE_URL=http://192.168.1.100:3000   # 对外访问地址（必填）
```

**3. 启动**

```bash
docker compose up -d
```

**4. 访问**

| 地址 | 说明 |
|------|------|
| `http://IP:3000/admin` | 管理后台 |
| `http://IP:3000/api/reader/tts-configs` | 阅读 App 声音源 |
| `http://IP:3000/health` | 健康检查 |

---

### 方式二：直接用 Docker

```bash
docker run -d \
  --name mimo-tts-proxy \
  --restart unless-stopped \
  -p 3000:3000 \
  -e MIMO_API_KEY=sk-xxxxx \
  -e PUBLIC_BASE_URL=http://192.168.1.100:3000 \
  -v $(pwd)/data:/data \
  limairui/mimo-tts-proxy:latest
```

---

### 方式三：本地运行

**环境要求**：Node.js 18+

```bash
# 克隆仓库
git clone https://github.com/hikki-fan/tts-proxy.git
cd tts-proxy

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少填写 MIMO_API_KEY

# 开发模式（热重载）
npm run dev

# 生产模式
npm start
```

---

## Docker Compose 示例

### 标准部署（`docker-compose.yml`）

```yaml
services:
  mimo-tts-proxy:
    image: limairui/mimo-tts-proxy:latest
    container_name: mimo-tts-proxy
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      DATA_DIR: /data
      CACHE_DIR: /data/cache
    volumes:
      - ./data:/data
```

配合 `.env` 文件：

```env
MIMO_API_KEY=sk-your-key-here
PUBLIC_BASE_URL=http://192.168.1.100:3000
```

### NAS / VPS 部署（`docker-compose.nas.yml`）

```yaml
services:
  mimo-tts-proxy:
    image: limairui/mimo-tts-proxy:latest
    container_name: mimo-tts-proxy
    restart: unless-stopped
    ports:
      - "7777:3000"          # 左边改为你的对外端口
    environment:
      - MIMO_API_KEY=sk-xxxxx
      - PUBLIC_BASE_URL=https://tts.yourdomain.com:7777
      - DATA_DIR=/data
      - CACHE_DIR=/data/cache
      # 可选 ─────────────────────────────────────
      # - ACCESS_TOKEN=random_token   # 阅读端访问鉴权
      # - ADMIN_TOKEN=admin_password  # 管理界面密码
      # - DEFAULT_VOICE=mimo_default
      # - DEFAULT_FORMAT=mp3
      # - CACHE_MAX_ITEMS=500
    volumes:
      - ./data:/data
```

### 自行构建镜像

```bash
# 构建
docker build -t mimo-tts-proxy:local .

# 运行
docker run -d \
  --name mimo-tts-proxy \
  -p 3000:3000 \
  -e MIMO_API_KEY=sk-xxxxx \
  -e PUBLIC_BASE_URL=http://localhost:3000 \
  -v $(pwd)/data:/data \
  mimo-tts-proxy:local
```

---

## 常用 Docker 命令

```bash
# 查看运行状态
docker ps | grep mimo

# 查看日志
docker logs -f mimo-tts-proxy

# 重启服务
docker restart mimo-tts-proxy

# 停止并删除
docker compose down

# 更新到最新镜像
docker compose pull && docker compose up -d

# 进入容器调试
docker exec -it mimo-tts-proxy sh

# 清理缓存（不重启）
# → 管理后台 → 概览 → 清理缓存
# 或直接删除数据目录下的 cache：
rm -rf ./data/cache/*
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `MIMO_API_KEY` | — | **必填** MiMo API Key |
| `PUBLIC_BASE_URL` | 从请求推断 | 写入声音源 URL 的对外地址 |
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com/v1` | MiMo API 地址 |
| `MIMO_MODEL` | `mimo-v2.5-tts` | 默认 TTS 模型 |
| `DEFAULT_VOICE` | `mimo_default` | 默认音色 |
| `DEFAULT_FORMAT` | `mp3` | 音频格式：`mp3` / `wav` / `pcm16` |
| `DEFAULT_SPEED` | `1` | 语速（0.6 ~ 1.4） |
| `ACCESS_TOKEN` | — | 阅读端访问 Token（留空不鉴权） |
| `ADMIN_TOKEN` | — | 管理后台密码（留空不鉴权） |
| `CACHE_ENABLED` | `true` | 是否启用音频缓存 |
| `CACHE_DIR` | `./data/cache` | 缓存目录 |
| `CACHE_MAX_ITEMS` | `500` | 缓存文件上限 |
| `REQUEST_TIMEOUT_MS` | `120000` | MiMo 请求超时（毫秒） |
| `LOG_ENABLED` | `true` | 是否记录 TTS 调用日志 |
| `LOG_DIR` | `./data/logs` | 日志目录 |
| `LOG_RETENTION_DAYS` | `30` | 日志保留天数 |
| `DATA_DIR` | `./data` | 数据根目录（settings/logs/cache） |

> **注意**：运行时通过管理后台修改的设置保存在 `data/settings.json`，优先级高于环境变量。

---

## 管理后台

访问 `http://IP:PORT/admin`

### 主要功能

**概览**
- 音色数量、缓存文件数和体积
- 订阅源 URL 复制（本地/对外/旧版/一键导入）
- 订阅 JSON 预览

**统计**
- TTS 调用折线图（今日/7天/30天）
- 按模型分类的用量分布
- 调用次数 / 字符数切换

**配置**
- MiMo API Key、Base URL、默认模型
- 对外访问地址（IP/域名/端口）
- 阅读访问 Token 和管理 Token

**工作台 → 合成测试**
- 三种模型卡片：标准 TTS / 声音设计 / 声音克隆
- 卡片式音色选择（支持语言/性别筛选）
- 格式、语速调整和试听

**工作台 → 音色管理**
- 多维筛选（语言/性别/模型）
- 音色预设下拉选择
- AI 情感分析配置（角色设定 + 提示词模板）

---

## 声音源接入阅读 App

在阅读/Legado 中：

1. 进入"听书" → "声音源管理" → 右上角导入
2. 填入：`http://你的IP:3000/api/reader/tts-configs`
3. 或使用一键导入链接：`http://你的IP:3000/api/import-url`

声音源 URL 格式（自动生成）：

```
http://IP:3000/api/tts?voiceId=mimo-bingtang&voice=冰糖&model=mimo-v2.5-tts&speed={{speakSpeed}}&format=mp3&text={{java.encodeURI(java.encodeURI(speakText))}}
```

---

## 模型说明

| 模型 ID | 名称 | 特点 |
|---------|------|------|
| `mimo-v2.5-tts` | 标准 TTS | 内置音色，稳定快速 |
| `mimo-v2.5-tts-voicedesign` | 声音设计 | 自然语言描述生成声音风格 |
| `mimo-v2.5-tts-voiceclone` | 声音克隆 | 上传 MP3/WAV 样本复刻音色 |

---

## 调试

```bash
# 测试 MiMo 直连
npm run test:mimo -- "你好，这是一次测试"

# 测试 HTTP 接口（需服务运行）
curl "http://127.0.0.1:3000/api/tts?text=%E4%BD%A0%E5%A5%BD&voice=mimo_default" -o test.mp3

# 查看健康状态
curl http://127.0.0.1:3000/health

# 热重载开发
npm run dev
```

---

## 许可

MIT License
