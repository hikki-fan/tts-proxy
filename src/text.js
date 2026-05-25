function decodeMaybeEncoded(value) {
  if (value === undefined || value === null) return '';

  let text = Array.isArray(value) ? value[0] : String(value);
  text = text.replace(/\+/g, ' ');

  for (let i = 0; i < 2; i += 1) {
    if (!/%[0-9a-fA-F]{2}/.test(text)) break;
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }

  return text.trim();
}

function normalizeFormat(value, defaultFormat) {
  const format = String(value || defaultFormat || 'mp3').toLowerCase();
  if (format === 'wav' || format === 'pcm16' || format === 'mp3' || format === 'aac') return format;
  return defaultFormat || 'mp3';
}

function contentTypeForFormat(format) {
  if (format === 'wav') return 'audio/wav';
  if (format === 'aac') return 'audio/aac';
  if (format === 'pcm16') return 'application/octet-stream';
  return 'audio/mpeg';
}

function normalizeSpeed(value, defaultSpeed) {
  const text = String(value || defaultSpeed || '1').trim();
  if (text === '{{speakSpeed}}') return String(defaultSpeed || '1');
  return text;
}

module.exports = {
  decodeMaybeEncoded,
  normalizeFormat,
  contentTypeForFormat,
  normalizeSpeed
};
