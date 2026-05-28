# MiMo TTS HTTP Proxy

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://hub.docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

MiMo TTS HTTP Proxy 是一个面向阅读 App 的 TTS 代理服务。它把 MiMo TTS 和 Gemini Live Audio 封装成 HTTP 接口，并自动生成阅读/Legado/Gedoor 可导入的声音源配置。

服务自带 Web 管理后台，默认入口：

```text
http://ip:3000/admin
```

## 功能特性

- 安卓阅读声音源订阅：`/api/reader/tts-configs-v2.json`
- iOS读不舍手声音源：`/api/reader/tts-configs-v2.json`
- MiMo 标准 TTS、声音设计、声音克隆
- Gemini Live Audio 音色支持
- Web 管理后台：配置、试听、音色管理、订阅源预览
- 本地音频缓存，减少重复 API 调用
- TTS 调用日志和统计

## 快速开始

### 本地运行

需要 Node.js 18 或更高版本。

```bash
npm install
cp .env.example .env
npm start
```

开发模式：

```bash
npm run dev
```

启动后访问：

```text
http://127.0.0.1:3000/admin
```

首次使用建议在 `.env` 或管理后台里配置：

```env
MIMO_API_KEY=your_mimo_api_key
PUBLIC_BASE_URL=http://127.0.0.1:3000
```

如果只在本机测试，`PUBLIC_BASE_URL` 可以保持 `http://127.0.0.1:3000`。如果要给手机上的阅读 App 使用，需要改成手机能访问到的地址，例如：

```env
PUBLIC_BASE_URL=http://192.168.1.100:3000
```

### Docker Compose

```bash
cp .env.example .env
docker compose up -d
```

`docker-compose.yml` 默认映射：

```text
http://宿主机IP:3000/admin
```

```yaml
services:
  mimo-tts-proxy:
    image: limairui/mimo-tts-proxy:latest
    container_name: mimo-tts-proxy
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - MIMO_API_KEY=your_mimo_api_key
      - PUBLIC_BASE_URL=http://your-ip-or-domain:3000
      - DATA_DIR=/data
      - CACHE_DIR=/data/cache
    volumes:
      - ./data:/data
```

如果通过反向代理或公网域名访问，务必把 `PUBLIC_BASE_URL` 设置为最终外部地址，例如：

```env
PUBLIC_BASE_URL=https://tts.example.com
```

## 管理后台

访问：

```text
http://127.0.0.1:3000/admin
```

管理后台主要功能：

- 查看服务状态、缓存数量、声音源地址
- 复制阅读/读不舍手导入链接
- 配置 MiMo API Key、Gemini API Key、默认音色
- 配置 `PUBLIC_BASE_URL`、阅读访问 Token、管理后台 Token
- 管理订阅中显示的音色
- 测试 TTS 合成并在线播放
- 查看 TTS 调用统计和缓存列表

如果设置了 `ADMIN_TOKEN`，进入后台时需要输入该 Token。



## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `DATA_DIR` | `./data` | 数据目录 |
| `PUBLIC_BASE_URL` | 从请求推断 | 写入声音源的外部访问地址 |
| `MIMO_API_KEY` | 空 | MiMo API Key |
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com/v1` | MiMo API 地址 |
| `MIMO_MODEL` | `mimo-v2.5-tts` | 默认 MiMo 模型 |
| `GEMINI_API_KEY` | 空 | Gemini API Key |
| `GEMINI_MODEL` | `gemini-2.5-flash-native-audio-preview-12-2025` | 默认 Gemini Live 模型 |
| `DEFAULT_VOICE` | `mimo_default` | 默认音色 |
| `DEFAULT_FORMAT` | `mp3` | 默认输出格式 |
| `DEFAULT_SPEED` | `1` | 默认语速 |
| `DEFAULT_VOLUME` | `100` | 默认音量 |
| `ACCESS_TOKEN` | 空 | 阅读端访问 Token |
| `ADMIN_TOKEN` | 空 | 管理后台 Token |
| `CACHE_ENABLED` | `true` | 是否启用缓存 |
| `CACHE_DIR` | `./data/cache` | 缓存目录 |
| `CACHE_MAX_ITEMS` | `500` | 缓存文件数量上限 |
| `REQUEST_TIMEOUT_MS` | `120000` | API 请求超时时间 |
| `LOG_ENABLED` | `true` | 是否记录调用日志 |
| `LOG_DIR` | `./data/logs` | 日志目录 |
| `LOG_RETENTION_DAYS` | `30` | 日志保留天数 |
| `EMOTION_ENABLED` | `false` | 是否启用情感分析提示词 |

运行后在管理后台修改的设置会保存到：

```text
data/settings.json
```

这些设置会覆盖对应环境变量。

## 音色配置

默认音色配置在：

```text
config/voices.json
```

每个音色可配置：

- `id`：音色唯一 ID
- `name`：显示名称
- `voice`：传给 TTS 服务的 voice 名称
- `provider`：`mimo` 或 `gemini`
- `model`：指定模型，留空使用默认模型
- `voiceDescription`：声音设计描述
- `language`：`zh` 或 `en`
- `gender`：`male` 或 `female`
- `order`：订阅源排序
- `inSubscription`：是否出现在阅读订阅源中

建议优先通过管理后台维护音色，避免手动编辑 JSON 出错。

## 模型说明

| 模型 ID | 类型 | 说明 |
| --- | --- | --- |
| `mimo-v2.5-tts` | 标准 TTS | 内置音色，适合稳定朗读 |
| `mimo-v2.5-tts-voicedesign` | 声音设计 | 使用自然语言描述生成声音风格 |
| `mimo-v2.5-tts-voiceclone` | 声音克隆 | 使用上传的 MP3/WAV 样本复刻音色 |
| `gemini-3.1-flash-live'` | 实时对话模型 | 实时对话模型 |
| `gemini-2.5-flash-native-audio` | 实时对话模型 | 实时对话模型 |

Gemini 音色使用 Gemini Live Audio，配置 `GEMINI_API_KEY` 后可在后台测试。

## 常用命令

```bash
# 启动
npm start

# Docker 启动
docker compose up -d

# Docker 查看日志
docker logs -f mimo-tts-proxy

# Docker 重启
docker restart mimo-tts-proxy
```
## 许可证

MIT License
