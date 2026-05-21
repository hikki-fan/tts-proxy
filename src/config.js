const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config();

const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(rootDir, 'data');
const voicesPath = process.env.VOICES_FILE
  ? path.resolve(process.env.VOICES_FILE)
  : path.join(rootDir, 'config', 'voices.json');
const settingsPath = process.env.SETTINGS_FILE
  ? path.resolve(process.env.SETTINGS_FILE)
  : path.join(dataDir, 'settings.json');

function boolFromEnv(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intFromEnv(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function boolSettingOrEnv(settings, key, envValue, defaultValue) {
  if (hasOwn(settings, key)) return boolFromEnv(String(settings[key]), defaultValue);
  return boolFromEnv(envValue, defaultValue);
}

function normalizeVoices(voices) {
  if (!Array.isArray(voices) || voices.length === 0) {
    throw new Error('At least one voice is required');
  }

  return voices.map((voice, index) => ({
    id: String(voice.id || `mimo-${index + 1}`),
    name: String(voice.name || voice.voice || `MiMo ${index + 1}`),
    voice: String(voice.voice || process.env.DEFAULT_VOICE || 'mimo_default'),
    model: String(voice.model || ''),
    voiceDescription: String(voice.voiceDescription || ''),
    language: String(voice.language || inferLanguage(voice.voice || voice.name)),
    gender: String(voice.gender || inferGender(voice.voice || voice.name)),
    description: String(voice.description || ''),
    badge: String(voice.badge || ''),
    color: String(voice.color || ''),
    order: Number.isFinite(Number(voice.order)) ? Number(voice.order) : index + 1,
    cloneAudioFile: String(voice.cloneAudioFile || '')
  }));
}

function inferLanguage(value) {
  return /^[\x00-\x7F]+$/.test(String(value || '')) ? 'en' : 'zh';
}

function inferGender(value) {
  const text = String(value || '').toLowerCase();
  if (['suda', 'baihua', 'milo', '苏打', '白桦'].some((name) => text.includes(name))) {
    return 'male';
  }
  return 'female';
}

const models = [
  {
    id: 'mimo-v2.5-tts',
    name: '标准 TTS v2.5',
    mode: 'standard',
    description: '内置音色，适合阅读朗读和稳定输出。'
  },
  {
    id: 'mimo-v2.0-tts',
    name: '标准 TTS v2.0',
    mode: 'standard',
    description: '兼容 v2.0 标准 TTS 模型。'
  },
  {
    id: 'mimo-v2.5-tts-voicedesign',
    name: '声音设计',
    mode: 'design',
    description: '通过自然语言描述生成新的声音风格。'
  },
  {
    id: 'mimo-v2.5-tts-voiceclone',
    name: '声音克隆',
    mode: 'clone',
    description: '使用克隆音色或预设 voice ID 合成。'
  }
];

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function loadVoices() {
  const raw = fs.readFileSync(voicesPath, 'utf8');
  return normalizeVoices(JSON.parse(raw));
}

async function saveVoices(voices) {
  const normalized = normalizeVoices(voices);
  await fs.promises.mkdir(path.dirname(voicesPath), { recursive: true });
  await fs.promises.writeFile(
    voicesPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf8'
  );
  config.voices = normalized;
  return normalized;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function settingOrEnv(settings, key, envValue, defaultValue = '') {
  if (hasOwn(settings, key)) return String(settings[key] ?? '');
  return envValue || defaultValue;
}

function intSettingOrEnv(settings, key, envValue, defaultValue) {
  if (hasOwn(settings, key)) return intFromEnv(settings[key], defaultValue);
  return intFromEnv(envValue, defaultValue);
}

function normalizeWritableSettings(input = {}) {
  const normalized = {};
  const stringFields = [
    'publicBaseUrl',
    'mimoBaseUrl',
    'mimoModel',
    'defaultVoice',
    'defaultFormat',
    'defaultSpeed',
    'defaultVolume',
  ];

  for (const field of stringFields) {
    if (hasOwn(input, field)) normalized[field] = String(input[field] ?? '').trim();
  }

  if (hasOwn(input, 'requestTimeoutMs')) {
    normalized.requestTimeoutMs = intFromEnv(input.requestTimeoutMs, config.requestTimeoutMs);
  }

  if (hasOwn(input, 'emotionEnabled')) {
    normalized.emotionEnabled = Boolean(input.emotionEnabled);
  }

  for (const field of ['emotionSystemPrompt', 'emotionUserTemplate']) {
    if (hasOwn(input, field)) normalized[field] = String(input[field] ?? '');
  }

  for (const field of ['mimoApiKey', 'accessToken', 'adminToken']) {
    const clearFlag = `clear${field.slice(0, 1).toUpperCase()}${field.slice(1)}`;
    if (input[clearFlag]) {
      normalized[field] = '';
    } else if (hasOwn(input, field) && String(input[field] ?? '').trim()) {
      normalized[field] = String(input[field]).trim();
    }
  }

  if (normalized.mimoBaseUrl) normalized.mimoBaseUrl = normalized.mimoBaseUrl.replace(/\/+$/, '');
  return normalized;
}

async function saveSettings(input = {}) {
  const current = loadSettings();
  const normalized = normalizeWritableSettings(input);
  const next = { ...current, ...normalized };

  await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.promises.writeFile(
    settingsPath,
    `${JSON.stringify(next, null, 2)}\n`,
    'utf8'
  );

  applySettings(normalized);
  return getSettingsView();
}

function applySettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    if (hasOwn(config, key)) config[key] = value;
  }
}

function maskSecret(value) {
  const secret = String(value || '');
  if (!secret) return '';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function getSettingsView() {
  return {
    publicBaseUrl: config.publicBaseUrl,
    mimoBaseUrl: config.mimoBaseUrl,
    mimoModel: config.mimoModel,
    mimoApiKeyConfigured: Boolean(config.mimoApiKey),
    mimoApiKeyMasked: maskSecret(config.mimoApiKey),
    accessTokenConfigured: Boolean(config.accessToken),
    accessTokenMasked: maskSecret(config.accessToken),
    adminTokenConfigured: Boolean(config.adminToken),
    adminTokenMasked: maskSecret(config.adminToken),
    defaultVoice: config.defaultVoice,
    defaultFormat: config.defaultFormat,
    defaultSpeed: config.defaultSpeed,
    defaultVolume: config.defaultVolume,
    requestTimeoutMs: config.requestTimeoutMs,
    emotionEnabled: config.emotionEnabled,
    emotionSystemPrompt: config.emotionSystemPrompt,
    emotionUserTemplate: config.emotionUserTemplate
  };
}

const settings = loadSettings();

const config = {
  rootDir,
  dataDir,
  voicesPath,
  settingsPath,
  port: intFromEnv(process.env.PORT, 3000),
  publicBaseUrl: settingOrEnv(settings, 'publicBaseUrl', process.env.PUBLIC_BASE_URL),
  mimoApiKey: settingOrEnv(settings, 'mimoApiKey', process.env.MIMO_API_KEY),
  mimoBaseUrl: settingOrEnv(settings, 'mimoBaseUrl', process.env.MIMO_BASE_URL, 'https://api.xiaomimimo.com/v1').replace(/\/+$/, ''),
  mimoModel: settingOrEnv(settings, 'mimoModel', process.env.MIMO_MODEL, 'mimo-v2.5-tts'),
  models,
  accessToken: settingOrEnv(settings, 'accessToken', process.env.ACCESS_TOKEN),
  adminToken: settingOrEnv(settings, 'adminToken', process.env.ADMIN_TOKEN),
  defaultVoice: settingOrEnv(settings, 'defaultVoice', process.env.DEFAULT_VOICE, 'mimo_default'),
  defaultFormat: settingOrEnv(settings, 'defaultFormat', process.env.DEFAULT_FORMAT, 'mp3'),
  defaultSpeed: settingOrEnv(settings, 'defaultSpeed', process.env.DEFAULT_SPEED, '1'),
  defaultVolume: settingOrEnv(settings, 'defaultVolume', process.env.DEFAULT_VOLUME, '100'),
  cacheEnabled: boolFromEnv(process.env.CACHE_ENABLED, true),
  cacheDir: process.env.CACHE_DIR || path.join(dataDir, 'cache'),
  cacheMaxItems: intFromEnv(process.env.CACHE_MAX_ITEMS, 500),
  requestTimeoutMs: intSettingOrEnv(settings, 'requestTimeoutMs', process.env.REQUEST_TIMEOUT_MS, 120000),
  logEnabled: boolFromEnv(process.env.LOG_ENABLED, true),
  logDir: process.env.LOG_DIR || path.join(dataDir, 'logs'),
  logRetentionDays: intFromEnv(process.env.LOG_RETENTION_DAYS, 30),
  emotionEnabled: boolSettingOrEnv(settings, 'emotionEnabled', process.env.EMOTION_ENABLED, false),
  emotionSystemPrompt: settingOrEnv(settings, 'emotionSystemPrompt', '', ''),
  emotionUserTemplate: settingOrEnv(settings, 'emotionUserTemplate', '', ''),
  voices: loadVoices()
};

module.exports = { config, saveVoices, saveSettings, getSettingsView };
