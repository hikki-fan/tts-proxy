const fs = require('node:fs');
const path = require('node:path');

let logDir = null;
let retentionDays = 30;

function init(dir, days) {
  logDir = dir;
  retentionDays = days || 30;
  fs.mkdirSync(dir, { recursive: true });
  cleanOldLogs();
  setInterval(cleanOldLogs, 6 * 60 * 60 * 1000);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function logTtsCall(record) {
  if (!logDir) return;
  const line = `${JSON.stringify({ ts: Date.now(), ...record })}\n`;
  fs.appendFile(path.join(logDir, `${todayStr()}.jsonl`), line, (err) => {
    if (err) console.error('[logger] write failed:', err.message);
  });
}

function cleanOldLogs() {
  if (!logDir) return;
  try {
    const cutoff = Date.now() - retentionDays * 86400000;
    for (const file of fs.readdirSync(logDir)) {
      const m = file.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!m) continue;
      if (new Date(m[1]).getTime() < cutoff) {
        fs.unlinkSync(path.join(logDir, file));
      }
    }
  } catch (err) {
    console.error('[logger] cleanup error:', err.message);
  }
}

function readDay(dateStr) {
  if (!logDir) return [];
  try {
    const content = fs.readFileSync(path.join(logDir, `${dateStr}.jsonl`), 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getStats(period) {
  const now = new Date();

  function modelMode(m, provider) {
    if (provider === 'gemini') return 'gemini';
    if (!m) return 'standard';
    if (m.includes('voicedesign')) return 'design';
    if (m.includes('voiceclone')) return 'clone';
    return 'standard';
  }

  function emptyBucket(label) {
    return {
      label, calls: 0, chars: 0,
      byModel:      { standard: 0, design: 0, clone: 0, gemini: 0 },
      byModelChars: { standard: 0, design: 0, clone: 0, gemini: 0 }
    };
  }

  function addRecord(bucket, r) {
    const m = modelMode(r.model, r.provider);
    const c = r.chars || 0;
    bucket.calls += 1;
    bucket.chars += c;
    bucket.byModel[m]      += 1;
    bucket.byModelChars[m] += c;
  }

  if (period === 'day') {
    const dateStr = now.toISOString().slice(0, 10);
    const records = readDay(dateStr);
    const buckets = Array.from({ length: 24 }, (_, i) => emptyBucket(`${String(i).padStart(2, '0')}:00`));
    for (const r of records) addRecord(buckets[new Date(r.ts).getHours()], r);
    return { period, buckets };
  }

  const days = period === 'week' ? 7 : 30;
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const records = readDay(dateStr);
    const bucket = emptyBucket(dateStr.slice(5));
    for (const r of records) addRecord(bucket, r);
    buckets.push(bucket);
  }
  return { period, buckets };
}

module.exports = { init, logTtsCall, cleanOldLogs, getStats };
