/**
 * DoubaoClient — 调用字节跳动豆包 TTS API（ARK 平台 /audio/speech 端点）
 *
 * API 与 OpenAI audio/speech 兼容：
 *   POST {baseUrl}/audio/speech
 *   Authorization: Bearer {apiKey}
 *   { model, input, voice, response_format, speed }
 *   → 直接返回二进制音频（非 JSON，非 base64）
 */
class DoubaoClient {
  constructor(options) {
    this.update(options);
  }

  update(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'apiKey')) this.apiKey = options.apiKey;
    if (Object.prototype.hasOwnProperty.call(options, 'baseUrl')) this.baseUrl = options.baseUrl;
    if (Object.prototype.hasOwnProperty.call(options, 'model')) this.model = options.model;
    if (Object.prototype.hasOwnProperty.call(options, 'timeoutMs')) this.timeoutMs = options.timeoutMs;
  }

  async synthesize({ text, voice, format, speed, model }) {
    if (!this.apiKey) {
      const error = new Error('DOUBAO_API_KEY 未配置，请在管理页面填写豆包 API Key');
      error.statusCode = 500;
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs || 120000);
    const t0 = Date.now();

    const effectiveModel = model || this.model || 'doubao-tts-hd';
    // 豆包 TTS 支持 mp3 / wav；pcm16 回退到 wav
    const responseFormat = format === 'mp3' ? 'mp3' : 'wav';
    // 速度范围 0.5–2.0
    const speedNum = Number.parseFloat(speed);
    const clampedSpeed = Number.isFinite(speedNum)
      ? Math.max(0.5, Math.min(2.0, speedNum))
      : 1.0;

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: effectiveModel,
          input: text,
          voice,
          response_format: responseFormat,
          speed: clampedSpeed
        }),
        signal: controller.signal
      });

      const ms = Date.now() - t0;

      if (!response.ok) {
        let details;
        try {
          details = await response.json();
        } catch {
          const raw = await response.text().catch(() => '');
          details = raw.slice(0, 300);
        }
        console.error(
          `[Doubao] ${ts()} model=${effectiveModel} voice=${voice} chars=${text.length} ${ms}ms HTTP ${response.status} ERR:`,
          JSON.stringify(details)
        );
        const error = new Error(`豆包 API 请求失败（HTTP ${response.status}）`);
        error.statusCode = response.status === 401 ? 401 : 502;
        error.details = details;
        throw error;
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(
        `[Doubao] ${ts()} model=${effectiveModel} voice=${voice} chars=${text.length} ${ms}ms OK`
      );
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error(
          `[Doubao] ${ts()} model=${effectiveModel} voice=${voice} chars=${text.length} TIMEOUT`
        );
        const error = new Error('豆包 TTS 请求超时');
        error.statusCode = 504;
        throw error;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function ts() {
  return new Date().toISOString();
}

module.exports = { DoubaoClient };
