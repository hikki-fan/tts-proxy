const fs = require('node:fs/promises');
const path = require('node:path');

const { config } = require('../src/config');
const { MimoClient } = require('../src/mimoClient');

async function main() {
  const text = process.argv.slice(2).join(' ') || '这是一次 MiMo TTS 连通性测试。';
  const client = new MimoClient({
    apiKey: config.mimoApiKey,
    baseUrl: config.mimoBaseUrl,
    model: config.mimoModel,
    timeoutMs: config.requestTimeoutMs
  });

  const audio = await client.synthesize({
    text,
    voice: config.defaultVoice,
    format: config.defaultFormat,
    userMessage: ''
  });

  const outDir = path.join(config.rootDir, 'data');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `mimo-test.${config.defaultFormat}`);
  await fs.writeFile(outFile, audio);
  console.log(`Wrote ${audio.length} bytes to ${outFile}`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
