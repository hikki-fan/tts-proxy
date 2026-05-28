const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');

const { config, saveVoices, saveSettings, getSettingsView } = require('./config');
const { AudioCache, cacheKey } = require('./cache');
const { MimoClient } = require('./mimoClient');
const { GeminiClient, GEMINI_LIVE_MODELS, GEMINI_NARRATION_PROMPT, GEMINI_USER_TEXT_PREFIX, makeStreamingWavHeader } = require('./geminiClient');
const {
  decodeMaybeEncoded,
  normalizeFormat,
  contentTypeForFormat,
  normalizeSpeed
} = require('./text');
const { makeVoiceSources, makeVoiceSourcesV2, makeImportUrl, makeImportUrlV2 } = require('./voiceSources');
const logger = require('./logger');
const { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_TEMPLATE } = require('./emotionAnalysis');

const app = express();
const adminPublicDir = path.join(config.rootDir, 'public', 'admin');
const cache = new AudioCache({
  enabled: config.cacheEnabled,
  dir: config.cacheDir,
  maxItems: config.cacheMaxItems
});
const mimo = new MimoClient({
  apiKey: config.mimoApiKey,
  baseUrl: config.mimoBaseUrl,
  model: config.mimoModel,
  timeoutMs: config.requestTimeoutMs
});
const gemini = new GeminiClient({
  apiKey: config.geminiApiKey,
  model: config.geminiModel,
  timeoutMs: config.requestTimeoutMs
});

// ─── Session store ────────────────────────────────────────────────────────────
const sessions = new Map(); // sessionId -> expiresAt
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function createSession() {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, Date.now() + SESSION_MAX_AGE_MS);
  return id;
}

function isValidSession(id) {
  if (!id) return false;
  const exp = sessions.get(id);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(id); return false; }
  return true;
}

function parseCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

app.set('trust proxy', true);
app.use(express.json({ limit: '20mb' }));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(adminPublicDir, 'index.html'));
});
app.use('/admin', express.static(adminPublicDir));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'mimo-tts-http-proxy',
    voices: config.voices.length,
    cacheEnabled: config.cacheEnabled,
    mimoConfigured: Boolean(config.mimoApiKey),
    geminiConfigured: Boolean(config.geminiApiKey)
  });
});

app.get('/api/admin/auth-status', (req, res) => {
  const sessionId = parseCookie(req, 'mimo_session');
  res.json({
    adminProtected: Boolean(config.adminToken),
    authenticated: !config.adminToken || isValidSession(sessionId)
  });
});

app.post('/api/admin/login', (req, res) => {
  if (!config.adminToken) return res.json({ ok: true });
  const { token } = req.body || {};
  if (token !== config.adminToken) {
    return res.status(401).json({ error: '密码错误' });
  }
  const sessionId = createSession();
  res.cookie('mimo_session', sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const sessionId = parseCookie(req, 'mimo_session');
  if (sessionId) sessions.delete(sessionId);
  res.clearCookie('mimo_session', { path: '/' });
  res.json({ ok: true });
});

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#4f6ef2"/>
  <rect x="5"  y="12" width="3" height="8"  rx="1.5" fill="white"/>
  <rect x="10" y="8"  width="3" height="16" rx="1.5" fill="white"/>
  <rect x="15" y="5"  width="3" height="22" rx="1.5" fill="white"/>
  <rect x="20" y="9"  width="3" height="14" rx="1.5" fill="white"/>
  <rect x="25" y="13" width="3" height="6"  rx="1.5" fill="white"/>
</svg>`;

app.get('/favicon.svg', (req, res) => {
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(FAVICON_SVG);
});

app.get('/favicon.ico', (req, res) => {
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(FAVICON_SVG);
});

app.get('/', (req, res) => {
  res.type('text/plain').send([
    'MiMo TTS HTTP Proxy',
    '',
    `Voice source JSON: ${makeAbsoluteUrl(req, '/api/reader/tts-configs')}`,
    `Legacy source JSON: ${makeAbsoluteUrl(req, '/api/reader/tts-configs?legacy=1')}`,
    `Import URL: ${makeImportUrl(req, config)}`
  ].join('\n'));
});

function handleTtsConfigs(req, res) {
  const legacy = req.query.legacy === '1' || req.query.format === 'legacy';
  const sources = makeVoiceSources(req, config, {
    legacy,
    format: normalizeFormat(req.query.audioFormat, config.defaultFormat),
    concurrentRate: req.query.concurrentRate || 1,
    model: normalizeModel(req.query.model)
  });
  res.json(sources);
}

function handleTtsConfig(req, res) {
  const legacy = req.query.legacy === '1' || req.query.format === 'legacy';
  const sources = makeVoiceSources(req, config, {
    legacy,
    format: normalizeFormat(req.query.audioFormat, config.defaultFormat),
    concurrentRate: req.query.concurrentRate || 1,
    model: normalizeModel(req.query.model)
  });
  const voiceId = req.query.id || req.query.voice;
  const selected = voiceId
    ? sources.find((source) => source.id === voiceId || source.name === voiceId)
    : sources[0];
  res.json(selected || sources[0]);
}

app.get('/api/reader/tts-configs', handleTtsConfigs);
app.get('/api/reader/tts-configs.json', handleTtsConfigs);
app.get('/api/reader/tts-config', handleTtsConfig);
app.get('/api/reader/tts-config.json', handleTtsConfig);

function handleTtsConfigsV2(req, res) {
  const sources = makeVoiceSourcesV2(req, config, {
    format: normalizeFormat(req.query.audioFormat, config.defaultFormat),
    model: normalizeModel(req.query.model)
  });
  res.json(sources);
}

app.get('/api/reader/tts-configs-v2', handleTtsConfigsV2);
app.get('/api/reader/tts-configs-v2.json', handleTtsConfigsV2);

app.get('/api/voices', (req, res) => {
  res.json({
    voices: config.voices.map(safeVoice),
    models: config.models,
    defaultModel: config.mimoModel,
    defaultVoice: config.defaultVoice
  });
});

app.get('/api/import-url', (req, res) => {
  res.json({
    url: makeImportUrl(req, config),
    source: makeAbsoluteUrl(req, '/api/reader/tts-configs'),
    urlV2: makeImportUrlV2(req, config),
    sourceV2: makeAbsoluteUrl(req, '/api/reader/tts-configs-v2.json')
  });
});

app.get('/api/admin/config', assertAdmin, async (req, res, next) => {
  try {
    const baseUrl = (config.publicBaseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const localBase = `http://127.0.0.1:${config.port}`;
    res.json({
      service: {
        name: 'mimo-tts-http-proxy',
        port: config.port,
        baseUrl,
        localBase,
        mimoConfigured: Boolean(config.mimoApiKey),
        mimoBaseUrl: config.mimoBaseUrl,
        mimoModel: config.mimoModel,
        geminiConfigured: Boolean(config.geminiApiKey),
        geminiModel: config.geminiModel,
        geminiModels: GEMINI_LIVE_MODELS,
        accessTokenEnabled: Boolean(config.accessToken),
        adminProtected: Boolean(config.adminToken),
        adminTokenConfigured: Boolean(config.adminToken),
        defaultVoice: config.defaultVoice,
        defaultFormat: config.defaultFormat
      },
      endpoints: {
        admin: `${baseUrl}/admin`,
        voiceSourcesLocal: `${localBase}/api/reader/tts-configs.json`,
        voiceSourcesPublic: `${baseUrl}/api/reader/tts-configs.json`,
        legacyVoiceSources: `${baseUrl}/api/reader/tts-configs.json?legacy=1`,
        importUrl: makeImportUrl(req, config),
        importUrlV2: makeImportUrlV2(req, config),
        voiceSourcesV2: `${baseUrl}/api/reader/tts-configs-v2.json`,
        health: `${baseUrl}/health`
      },
      models: config.models,
      voices: config.voices.map(safeVoice),
      settings: getSettingsView(),
      cache: await cache.stats()
    });
  } catch (error) {
    if (error.statusCode === 400) return next(error);
    res.json({
      ok: true,
      ready: false,
      cookie: '',
      found: 0,
      missing: ['sessionid', 'sid_guard', 'uid_tt'],
      message: error.message || '等待浏览器登录中'
    });
  }
});

app.get('/api/admin/settings', assertAdmin, (req, res) => {
  res.json({ settings: getSettingsView() });
});

app.put('/api/admin/settings', assertAdmin, async (req, res, next) => {
  try {
    const settings = await saveSettings({
      ...req.body,
      mimoModel: normalizeModel(req.body?.mimoModel)
    });
    mimo.update({
      apiKey: config.mimoApiKey,
      baseUrl: config.mimoBaseUrl,
      model: config.mimoModel,
      timeoutMs: config.requestTimeoutMs
    });
    gemini.update({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
      timeoutMs: config.requestTimeoutMs
    });
    res.json({ ok: true, settings });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/voices', assertAdmin, async (req, res, next) => {
  try {
    const voices = validateVoices(req.body?.voices);
    const saved = await saveVoices(voices);
    res.json({ ok: true, voices: saved });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/design-voices', assertAdmin, async (req, res, next) => {
  try {
    const voice = makeDesignVoice(req.body || {});
    const saved = await saveVoices([...config.voices, voice]);
    res.json({
      ok: true,
      voice: saved.find((item) => item.id === voice.id),
      voices: saved
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/stats', assertAdmin, (req, res) => {
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  const stats = logger.getStats(period);
  const total = stats.buckets.reduce(
    (s, b) => ({
      calls: s.calls + b.calls,
      chars: s.chars + b.chars,
      byModel: {
        standard: s.byModel.standard + (b.byModel?.standard || 0),
        design:   s.byModel.design   + (b.byModel?.design   || 0),
        clone:    s.byModel.clone    + (b.byModel?.clone    || 0),
        gemini:   s.byModel.gemini   + (b.byModel?.gemini   || 0)
      },
      byModelChars: {
        standard: s.byModelChars.standard + (b.byModelChars?.standard || 0),
        design:   s.byModelChars.design   + (b.byModelChars?.design   || 0),
        clone:    s.byModelChars.clone    + (b.byModelChars?.clone    || 0),
        gemini:   s.byModelChars.gemini   + (b.byModelChars?.gemini   || 0)
      }
    }),
    { calls: 0, chars: 0, byModel: { standard: 0, design: 0, clone: 0, gemini: 0 }, byModelChars: { standard: 0, design: 0, clone: 0, gemini: 0 } }
  );
  res.json({ ...stats, total });
});

app.post('/api/admin/clone-audio/:voiceId', assertAdmin, async (req, res, next) => {
  try {
    const { voiceId } = req.params;
    const { audioData } = req.body || {};

    const match = String(audioData || '').match(/^data:(audio\/(?:mpeg|mp3|wav));base64,(.+)$/s);
    if (!match) {
      const err = new Error('无效的音频数据，仅支持 MP3 / WAV，且须为 data URI 格式');
      err.statusCode = 400;
      throw err;
    }

    const voice = config.voices.find((v) => v.id === voiceId);
    if (!voice) {
      const err = new Error('音色不存在');
      err.statusCode = 404;
      throw err;
    }

    const cloneDir = require('node:path').join(config.dataDir, 'clone-voices');
    await require('node:fs').promises.mkdir(cloneDir, { recursive: true });

    const ext = match[1].includes('wav') ? 'wav' : 'mp3';
    const audioPath = require('node:path').join(cloneDir, `${voiceId}.${ext}`);
    await require('node:fs').promises.writeFile(audioPath, Buffer.from(match[2], 'base64'));

    const updated = config.voices.map((v) => v.id === voiceId ? { ...v, cloneAudioFile: audioPath } : v);
    await saveVoices(updated);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/emotion-defaults', assertAdmin, (req, res) => {
  res.json({ systemPrompt: DEFAULT_SYSTEM_PROMPT, userTemplate: DEFAULT_USER_TEMPLATE });
});


app.post('/api/admin/cache/clear', assertAdmin, async (req, res, next) => {
  try {
    const result = await cache.clear();
    res.json({ ok: true, ...result, cache: await cache.stats() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/cache/list', assertAdmin, async (req, res, next) => {
  try {
    const entries = await cache.list();
    res.json({ ok: true, entries, cache: await cache.stats() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/cache/delete', assertAdmin, async (req, res, next) => {
  try {
    const keys = req.body?.keys;
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'keys must be a non-empty array' });
    }
    await cache.deleteEntries(keys);
    res.json({ ok: true, deleted: keys.length, cache: await cache.stats() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/cache/download/:key', assertAdmin, async (req, res, next) => {
  const { createReadStream } = require('node:fs');
  try {
    const { key } = req.params;
    const entries = await cache.list();
    const entry = entries.find(e => e.key === key);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    const filePath = cache.filePath(key, entry.format);
    const { stat } = await require('node:fs/promises').stat(filePath).then(s => ({ stat: s })).catch(() => ({ stat: null }));
    if (!stat) return res.status(404).json({ error: 'File not found' });
    const mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', pcm16: 'audio/pcm', ogg: 'audio/ogg' };
    const mime = mimeMap[entry.format] || 'application/octet-stream';
    const safeName = (entry.voice || 'audio').replace(/[^\w一-龥.-]/g, '_');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.${entry.format}`);
    res.setHeader('Content-Length', stat.size);
    createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/test-tts', assertAdmin, async (req, res, next) => {
  try {
    await synthesizeAndSend(req.body || {}, res, { emotion: config.emotionEnabled, log: config.logEnabled, clientId: getClientId(req) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/tts', async (req, res, next) => {
  try {
    assertAccess(req);
    await synthesizeAndSend(req.query, res, { log: config.logEnabled, emotion: config.emotionEnabled, clientId: getClientId(req) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tts', async (req, res, next) => {
  try {
    assertAccess(req);
    await synthesizeAndSend(req.body, res, { log: config.logEnabled, emotion: config.emotionEnabled, clientId: getClientId(req) });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, req, res, _next) => {
  const status = error.statusCode || 500;
  const payload = {
    error: error.message || 'Internal server error'
  };

  if (process.env.NODE_ENV !== 'production' && error.details) {
    payload.details = error.details;
  }

  res.status(status).json(payload);
});

function assertAccess(req) {
  if (!config.accessToken) return;
  const token = req.query.token || req.get('x-access-token');
  if (token !== config.accessToken) {
    const error = new Error('Invalid access token');
    error.statusCode = 401;
    throw error;
  }
}

function assertAdmin(req, res, next) {
  if (!config.adminToken) return next();
  if (isValidSession(parseCookie(req, 'mimo_session'))) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

async function synthesizeAndSend(params, res, opts = {}) {
  const startMs = Date.now();
  const emotionEnabled = Boolean(opts.emotion);
  const text = decodeMaybeEncoded(params.text || params.speakText);
  if (!text) {
    const error = new Error('Missing text parameter');
    error.statusCode = 400;
    throw error;
  }

  const voiceConfig = findVoiceConfig(params.voiceId, params.voice);
  const provider = normalizeProvider(params.provider || voiceConfig?.provider);
  const requestedFormat = normalizeFormat(params.format, config.defaultFormat);
  const voice = String(params.voice || voiceConfig?.voice || config.defaultVoice);
  const model = provider === 'gemini'
    ? normalizeGeminiModel(params.model || voiceConfig?.model || config.geminiModel)
    : normalizeModel(params.model || voiceConfig?.model);
  const speed = normalizeSpeed(params.speed, config.defaultSpeed);
  const volume = String(params.volume || config.defaultVolume);

  // 优先用 URL 中传来的 voiceDescription，否则从 voice 配置中读取（??不回退空字符串，改用显式判断）
  const paramDesc = String(params.voiceDescription || '').trim();
  const voiceDescription = paramDesc || voiceConfig?.voiceDescription || '';

  if (getModelMode(model) === 'design' && !emotionEnabled) {
    const explicit = decodeMaybeEncoded(params.userMessage);
    if (!explicit && !voiceDescription) {
      const error = new Error('声音设计模型需要填写”声音设计描述”，保存为新音色后订阅源会自动带上该描述。');
      error.statusCode = 400;
      throw error;
    }
  }

  const userMessage = emotionEnabled ? '' : buildUserMessage({ speed, volume, explicit: params.userMessage, voiceDescription });

  // gemini determines format at runtime; use requested format for cache key
  const format = provider === 'gemini' ? (requestedFormat === 'mp3' ? 'mp3' : 'wav') : requestedFormat;

  const keyPayload = {
    text,
    provider,
    voiceId: voiceConfig?.id || '',
    voice,
    speed,
    volume,
    format,
    userMessage,
    model,
    emotionEnabled,
    geminiNarrationPrompt: provider === 'gemini' ? `${GEMINI_NARRATION_PROMPT}\n${GEMINI_USER_TEXT_PREFIX}\nspeed=${speed}` : '',
    emotionSystemPrompt: emotionEnabled ? (config.emotionSystemPrompt || DEFAULT_SYSTEM_PROMPT) : '',
    emotionUserTemplate: emotionEnabled ? (config.emotionUserTemplate || DEFAULT_USER_TEMPLATE) : ''
  };
  const key = cacheKey(keyPayload);
  const cached = await cache.get(key, format);
  if (cached) {
    console.log(`[TTS]  ${new Date().toISOString()} CACHE_HIT  provider=${provider} voice=${voice} chars=${text.length} format=${format} ${Date.now()-startMs}ms`);
    if (opts.log) logger.logTtsCall({ chars: text.length, provider, voice, format, model, cached: true, duration: Date.now() - startMs });
    return sendAudio(res, cached, format, true);
  }

  const emotion = emotionEnabled ? {
    enabled: true,
    systemPrompt: config.emotionSystemPrompt,
    userTemplate: config.emotionUserTemplate
  } : null;

  // 克隆模型：读取音频样本文件并 base64 编码后作为 voice 传入
  if (getModelMode(model) === 'clone' && !voiceConfig?.cloneAudioFile) {
    const error = new Error('声音克隆音色需要先上传音频样本才能使用');
    error.statusCode = 400;
    throw error;
  }

  let cloneAudioData = null;
  if (getModelMode(model) === 'clone' && voiceConfig?.cloneAudioFile) {
    try {
      const fsPromises = require('node:fs').promises;
      const audioBuffer = await fsPromises.readFile(voiceConfig.cloneAudioFile);
      const ext = voiceConfig.cloneAudioFile.endsWith('.wav') ? 'wav' : 'mpeg';
      cloneAudioData = `data:audio/${ext};base64,${audioBuffer.toString('base64')}`;
    } catch (err) {
      console.error('[clone] 读取音频样本失败:', err.message);
    }
  }

  let audio, actualFormat;
  if (provider === 'gemini') {
    // WAV 格式启用流式响应：首帧 PCM 到达即开始推送，无需等待完整生成
    if (format !== 'mp3') {
      return await synthesizeGeminiStream({ gemini, text, voice, format, model, speed, clientId: opts.clientId, res, cache, key, startMs, opts, logger });
    }
    ({ audio, format: actualFormat } = await gemini.synthesize({ text, voice, format, model, speed, clientId: opts.clientId }));
  } else {
    audio = await mimo.synthesize({ text, voice, format, userMessage, model, emotion, cloneAudioData });
    actualFormat = format;
  }
  await cache.set(key, actualFormat, audio, { provider, voice, model, chars: text.length, textPreview: text.slice(0, 80) });
  const dur = Date.now() - startMs;
  console.log(`[TTS]  ${new Date().toISOString()} SYNTH      provider=${provider} voice=${voice} chars=${text.length} format=${actualFormat} ${dur}ms`);
  if (opts.log) logger.logTtsCall({ chars: text.length, provider, voice, format: actualFormat, model, cached: false, duration: dur });
  return sendAudio(res, audio, actualFormat, false);
}

function getClientId(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'local';
}

function validateVoices(voices) {
  if (!Array.isArray(voices) || voices.length === 0) {
    const error = new Error('At least one voice is required');
    error.statusCode = 400;
    throw error;
  }

  const ids = new Set();
  return voices.map((voice, index) => {
    const id = String(voice.id || '').trim();
    const name = String(voice.name || '').trim();
    const voiceValue = String(voice.voice || '').trim();
    const order = Number(voice.order);

    if (!id || !/^[A-Za-z0-9_.-]+$/.test(id)) {
      const error = new Error(`Invalid voice id at row ${index + 1}`);
      error.statusCode = 400;
      throw error;
    }
    if (ids.has(id)) {
      const error = new Error(`Duplicate voice id: ${id}`);
      error.statusCode = 400;
      throw error;
    }
    if (!name || !voiceValue) {
      const error = new Error(`Name and voice are required at row ${index + 1}`);
      error.statusCode = 400;
      throw error;
    }

    ids.add(id);
    const existing = config.voices.find((v) => v.id === id);
    const record = {
      id,
      name,
      voice: voiceValue,
      provider: normalizeProvider(voice.provider),
      language: String(voice.language || '').trim() || 'zh',
      gender: String(voice.gender || '').trim() || 'female',
      model: normalizeProvider(voice.provider) === 'gemini' ? '' : normalizeOptionalModel(voice.model),
      voiceDescription: decodeMaybeEncoded(voice.voiceDescription),
      description: String(voice.description || '').trim(),
      badge: String(voice.badge || '').trim(),
      color: String(voice.color || '').trim(),
      order: Number.isFinite(order) ? order : index + 1,
      cloneAudioFile: existing?.cloneAudioFile || '',
      inSubscription: voice.inSubscription !== false
    };

    if (record.model && getModelMode(record.model) === 'design' && !record.voiceDescription) {
      const error = new Error(`声音设计音色 "${name}" 需要填写声音设计描述`);
      error.statusCode = 400;
      throw error;
    }

    return record;
  });
}

function normalizeProvider(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'gemini') return 'gemini';
  return 'mimo';
}

function normalizeModel(value) {
  const model = String(value || '').trim();
  if (!model) return config.mimoModel;
  const known = config.models.some((item) => item.id === model);
  return known || model.startsWith('mimo-') ? model : config.mimoModel;
}

function normalizeOptionalModel(value) {
  const model = String(value || '').trim();
  return model ? normalizeModel(model) : '';
}

function normalizeGeminiModel(value) {
  return String(value || config.geminiModel).trim().replace(/^models\//, '') || config.geminiModel;
}



function getModelMode(model) {
  const id = String(model || config.mimoModel);
  const known = config.models.find((item) => item.id === id);
  if (known?.mode) return known.mode;
  if (id.includes('voicedesign')) return 'design';
  if (id.includes('voiceclone')) return 'clone';
  return 'standard';
}

function findVoiceConfig(voiceId, voiceValue) {
  const id = String(voiceId || '').trim();
  if (id) {
    const byId = config.voices.find((voice) => voice.id === id);
    if (byId) return byId;
  }

  const voice = String(voiceValue || '').trim();
  if (!voice) return null;
  return config.voices.find((item) => item.voice === voice) || null;
}

function makeDesignVoice(body) {
  const name = String(body.name || '').trim();
  const voiceDescription = decodeMaybeEncoded(body.voiceDescription);
  const model = normalizeModel(body.model || 'mimo-v2.5-tts-voicedesign');
  const mode = getModelMode(model);

  if (!name) {
    const error = new Error('新音色名称不能为空');
    error.statusCode = 400;
    throw error;
  }
  if (mode !== 'design' && mode !== 'clone') {
    const error = new Error('仅支持声音设计或声音克隆模型');
    error.statusCode = 400;
    throw error;
  }
  if (mode === 'design' && !voiceDescription) {
    const error = new Error('声音设计描述不能为空');
    error.statusCode = 400;
    throw error;
  }

  const isClone = mode === 'clone';
  const id = uniqueVoiceId(body.id || makeSlug(`${isClone ? 'clone' : 'design'}-${name}`));
  const order = Math.max(0, ...config.voices.map((voice) => Number(voice.order) || 0)) + 10;
  return {
    id,
    name,
    voice: String(body.voice || config.defaultVoice).trim() || config.defaultVoice,
    provider: 'mimo',
    model,
    voiceDescription,
    language: String(body.language || '').trim() || 'zh',
    gender: String(body.gender || '').trim() || 'female',
    description: String(body.description || voiceDescription).trim(),
    badge: String(body.badge || (isClone ? '声音克隆' : '声音设计')).trim(),
    color: String(body.color || (isClone ? '#7c3aed' : '#ff6b6b')).trim(),
    order
  };
}

function makeSlug(value) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `design-${Date.now().toString(36)}`;
}

function uniqueVoiceId(baseId) {
  const ids = new Set(config.voices.map((voice) => voice.id));
  const base = makeSlug(baseId);
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function buildUserMessage({ speed, volume, explicit, voiceDescription }) {
  const hints = [];
  const custom = decodeMaybeEncoded(explicit).trim();
  if (custom) hints.push(custom);

  const design = decodeMaybeEncoded(voiceDescription).trim();
  if (design) hints.push(`声音风格: ${design}`);

  const speedHint = describeSpeed(speed);
  if (speedHint) hints.push(speedHint);

  const volumeHint = describeVolume(volume);
  if (volumeHint) hints.push(volumeHint);

  return hints.length ? `请自然朗读文本。${hints.join('，')}。` : '';
}

function describeSpeed(speed) {
  if (!speed || speed === '{{speakSpeed}}') return '';

  const value = Number.parseFloat(speed);
  if (!Number.isFinite(value)) return '';

  if (value > 2) {
    if (value < 4.5) return '语速稍慢';
    if (value > 5.5) return '语速稍快';
    return '';
  }

  if (value < 0.9) return '语速稍慢';
  if (value > 1.1) return '语速稍快';
  return '';
}

function describeVolume(volume) {
  const value = Number.parseFloat(volume);
  if (!Number.isFinite(value)) return '';

  if (value < 80) return '音量稍低';
  if (value > 120) return '音量稍高';
  return '';
}

function sendAudio(res, audio, format, cached) {
  res.set({
    'Content-Type': contentTypeForFormat(format),
    'Content-Length': audio.length,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Cache': cached ? 'HIT' : 'MISS'
  });
  res.send(audio);
}

async function synthesizeGeminiStream({ gemini, text, voice, format, model, speed, clientId, res, cache, key, startMs, opts, logger }) {
  let headerSent = false;

  // onPcmChunk：每当 Gemini 推来一帧 PCM，立即写入 HTTP 响应
  const onPcmChunk = (chunk) => {
    if (res.writableEnded) return;
    if (!headerSent) {
      headerSent = true;
      res.set({
        'Content-Type': 'audio/wav',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Cache': 'MISS'
      });
      res.write(makeStreamingWavHeader());
    }
    res.write(chunk);
  };

  try {
    // synthesize 内部调用 onPcmChunk 流式推块，完成后返回完整 WAV 用于缓存
    const { audio, format: actualFormat } = await gemini.synthesize({ text, voice, format, model, speed, clientId, onPcmChunk });
    const dur = Date.now() - startMs;

    if (!res.writableEnded) res.end();

    // 后台缓存（不阻塞响应，失败静默忽略）
    cache.set(key, actualFormat, audio, { provider: 'gemini', voice, model, chars: text.length, textPreview: text.slice(0, 80) }).catch(() => {});

    console.log(`[TTS]  ${new Date().toISOString()} STREAM     provider=gemini voice=${voice} chars=${text.length} format=${actualFormat} ${dur}ms`);
    if (opts.log) logger.logTtsCall({ chars: text.length, provider: 'gemini', voice, format: actualFormat, model, cached: false, duration: dur });
  } catch (err) {
    if (!res.headersSent) throw err;
    if (!res.writableEnded) res.end();
    console.error(`[Gemini] Stream error after headers sent: ${err.message}`);
  }
}

function safeVoice(voice) {
  const { cloneAudioFile, ...rest } = voice;
  return { ...rest, cloneAudioReady: Boolean(cloneAudioFile) };
}

function makeAbsoluteUrl(req, path) {
  const base = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function start() {
  await cache.init();
  if (config.logEnabled) {
    logger.init(config.logDir, config.logRetentionDays);
  }
  app.listen(config.port, () => {
    console.log(`MiMo TTS proxy listening on http://0.0.0.0:${config.port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { app };
