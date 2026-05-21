# MiMo TTS HTTP Proxy

自建 MiMo TTS HTTP 转发服务，用于让读不舍手/阅读/Gedoor 通过 `api=http` 声音源调用 MiMo TTS。

## 功能

- 服务端保存 `MIMO_API_KEY`，阅读端只调用自建 URL。
- 提供 `/api/tts` 返回音频二进制。
- 提供 `/api/reader/tts-configs` 生成阅读可导入的声音源订阅 JSON。
- 提供 `/api/voices` 查看当前音色配置。
- 提供 `/admin` Web 管理页面，支持 API Key 配置、合成方案、模型选择、声音设计 preset 保存、音色管理、订阅预览、缓存清理和试听。
- 支持 `legado://import/httpTTS` 一键导入链接。
- 支持 Docker Compose 部署和本地音频缓存。

## 快速开始

```bash
cp .env.example .env
```

编辑 `.env`：

```env
MIMO_API_KEY=你的_mimo_api_key
PUBLIC_BASE_URL=http://你的服务器IP:3000
```

启动：

```bash
docker compose up -d --build
```

打开：

```text
http://你的服务器IP:3000/api/reader/tts-configs
```

管理页面：

```text
http://你的服务器IP:3000/admin
```

旧版/附件风格字段：

```text
http://你的服务器IP:3000/api/reader/tts-configs?legacy=1
```

一键导入：

```text
http://你的服务器IP:3000/api/import-url
```

## 阅读声音源 URL

生成的声音源 URL 类似：

```text
http://你的服务器IP:3000/api/tts?voiceId=mimo-bingtang&voice=冰糖&model=mimo-v2.5-tts&speed={{speakSpeed}}&format=mp3&text={{java.encodeURI(java.encodeURI(speakText))}}
```

服务会自动处理单次或双次 URL 编码。

`speed` 和 `volume` 会转成 MiMo 的风格提示；MiMo 当前 TTS 接口本身不暴露传统播放器式语速/音量字段。

## 模型选择

`/api/tts` 支持 `model` 参数，管理页里也可以切换：

- `mimo-v2.5-tts`：标准 TTS
- `mimo-v2.0-tts`：标准 TTS v2.0
- `mimo-v2.5-tts-voicedesign`：声音设计
- `mimo-v2.5-tts-voiceclone`：声音克隆

阅读订阅源默认使用配置里的默认模型；单个音色如果保存了自己的 `model`，会优先使用音色自己的模型。`/api/reader/tts-configs?model=...` 仍可临时覆盖普通音色的模型。

## 声音设计保存

声音设计模型需要填写“声音设计描述”，否则 MiMo 会返回 `user message content must not be empty for voice design model`。本服务已经在本地提前校验，避免把空描述发到 MiMo。

在管理页保存流程：

1. 打开 `/admin`，进入“工作台”。
2. 选择“声音设计”方案，模型会切到 `mimo-v2.5-tts-voicedesign`。
3. 填写“声音设计描述”，试听确认后填写“新音色名称”。
4. 点击“保存为新音色”。

保存后的音色是本服务的本地 preset，会写入 `config/voices.json`，订阅源里会自动带上：

```text
model=mimo-v2.5-tts-voicedesign&voiceDescription=...
```

MiMo 的声音设计模型不支持 `audio.voice` 参数，代理在调用该模型时会自动省略 `audio.voice`。

## 管理页配置

`/admin` 的“配置”页可以设置：

- MiMo API Key
- MiMo Base URL
- 默认模型
- 公开访问地址
- 默认 voice/格式
- 阅读访问 Token 和管理 Token

保存后的运行时配置写入 `data/settings.json`，该文件已加入 `.gitignore` 和 `.dockerignore`，不要提交到仓库。

## 公网保护

如果服务暴露到公网，建议设置：

```env
ACCESS_TOKEN=换成你自己的随机字符串
```

设置后，生成的声音源 URL 会自动附带 `token` 参数。

## 本地调试

```bash
npm install
npm start
```

测试 MiMo 直连：

```bash
npm run test:mimo -- "测试一句话"
```

测试 HTTP 接口：

```bash
curl "http://127.0.0.1:3000/api/tts?text=%E4%BD%A0%E5%A5%BD&voice=mimo_default" --output test.mp3
```

## 环境变量

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `DATA_DIR` | `./data` | 设置和缓存数据目录 |
| `PUBLIC_BASE_URL` | 自动从请求推断 | 写入声音源的公开访问地址 |
| `MIMO_API_KEY` | 空 | MiMo API Key |
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com/v1` | MiMo API Base URL |
| `MIMO_MODEL` | `mimo-v2.5-tts` | TTS 模型 |
| `DEFAULT_VOICE` | `mimo_default` | 默认音色 |
| `DEFAULT_FORMAT` | `mp3` | `mp3`、`wav` 或 `pcm16` |
| `ACCESS_TOKEN` | 空 | 可选访问保护 |
| `ADMIN_TOKEN` | 空 | 可选管理页面保护 |
| `CACHE_ENABLED` | `true` | 是否缓存音频 |
| `CACHE_DIR` | `./data/cache` | 缓存目录 |
| `REQUEST_TIMEOUT_MS` | `120000` | MiMo 请求超时 |

## MiMo 协议

服务调用 MiMo 的 OpenAI-compatible Chat Completions TTS 接口：

```text
POST https://api.xiaomimimo.com/v1/chat/completions
```

文本放在 `assistant` message，音频配置放在 `audio` 对象中。
