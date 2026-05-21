const { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_TEMPLATE } = require('./emotionAnalysis');

class MimoClient {
  constructor(options) {
    this.update(options);
  }

  update(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'apiKey')) this.apiKey = options.apiKey;
    if (Object.prototype.hasOwnProperty.call(options, 'baseUrl')) this.baseUrl = options.baseUrl;
    if (Object.prototype.hasOwnProperty.call(options, 'model')) this.model = options.model;
    if (Object.prototype.hasOwnProperty.call(options, 'timeoutMs')) this.timeoutMs = options.timeoutMs;
  }

  async synthesize(options) {
    if (!this.apiKey) {
      const error = new Error('MIMO_API_KEY is not configured');
      error.statusCode = 500;
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const t0 = Date.now();

    const model = options.model || this.model;
    const chars = (options.text || '').length;
    const voiceLabel = options.cloneAudioData ? '[clone-audio]' : (options.voice || '-');
    const emotionTag = options.emotion?.enabled ? '+emotion' : '';

    try {
      const audio = { format: options.format };
      if (options.cloneAudioData) {
        audio.voice = options.cloneAudioData;
      } else if (!isVoiceDesignModel(model) && options.voice) {
        audio.voice = options.voice;
      }

      const body = {
        model,
        messages: this.buildMessages(options.text, options.userMessage, options.emotion),
        audio
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'api-key': this.apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const raw = await response.text();
      const ms = Date.now() - t0;

      if (!response.ok) {
        const details = parseJson(raw) || raw.slice(0, 300);
        console.error(`[MiMo] ${ts()} ${model}${emotionTag} voice=${voiceLabel} chars=${chars} ${ms}ms HTTP ${response.status} ERR: ${JSON.stringify(details)}`);
        const error = new Error(`MiMo API request failed with HTTP ${response.status}`);
        error.statusCode = response.status;
        error.details = details;
        throw error;
      }

      const json = parseJson(raw);
      const audioData = findAudioData(json);
      if (!audioData) {
        console.error(`[MiMo] ${ts()} ${model}${emotionTag} voice=${voiceLabel} chars=${chars} ${ms}ms NO_AUDIO`);
        const error = new Error('MiMo API response did not include audio data');
        error.statusCode = 502;
        error.details = json;
        throw error;
      }

      console.log(`[MiMo] ${ts()} ${model}${emotionTag} voice=${voiceLabel} chars=${chars} ${ms}ms OK`);
      return Buffer.from(audioData, 'base64');
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error(`[MiMo] ${ts()} ${model}${emotionTag} voice=${voiceLabel} chars=${chars} TIMEOUT`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // emotion = { enabled, systemPrompt, userTemplate } 时，用情感分析模式构建消息。
  // MiMo TTS 不支持 system role，规则：
  //   user   → 角色设定 + 提示词模板（含原文），指导 MiMo 如何理解情感
  //   assistant → 待合成的原始文本（API 强制要求）
  // 未启用时保持原有行为：user: 语速音量提示，assistant: 待合成文本。
  buildMessages(text, userMessage, emotion) {
    if (emotion?.enabled) {
      const sysPrompt = emotion.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const template = emotion.userTemplate || DEFAULT_USER_TEMPLATE;
      const userContent = `${sysPrompt}\n\n${template.replace(/\$\{text\}/g, text)}`;
      return [
        { role: 'user', content: userContent },
        { role: 'assistant', content: text }
      ];
    }
    const messages = [];
    if (userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }
    messages.push({ role: 'assistant', content: text });
    return messages;
  }
}

function ts() {
  return new Date().toISOString();
}

function isVoiceDesignModel(model) {
  return String(model || '').includes('voicedesign');
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findAudioData(json) {
  const message = json?.choices?.[0]?.message;
  if (message?.audio?.data) return message.audio.data;

  const audio = json?.choices?.[0]?.delta?.audio || json?.audio;
  if (audio?.data) return audio.data;

  if (typeof json?.data === 'string') return json.data;
  return null;
}

module.exports = { MimoClient };
