import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');
export const WEB_DIR = resolve(ROOT, 'src', 'web');
export const DATA_DIR = resolve(ROOT, 'data');
const CONFIG_PATH = resolve(DATA_DIR, 'config.json');

export const VERSION = '1.0.0';

/** El puerto no se hereda del entorno: otras herramientas exportan PORT y lo mueven. */
export const PORT = Number(process.env.NODO_PORT ?? 8090);
export const HOST = process.env.NODO_HOST ?? '127.0.0.1';

export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';

export function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/** PIN de seis dígitos con CSPRNG: Math.random no sirve para credenciales. */
function newPin() {
  return String(randomInt(100_000, 1_000_000));
}

function writeConfig(path, config) {
  const tmp = `${path}.tmp`;
  // 0o600: el fichero contiene el PIN y el secreto de sesión.
  writeFileSync(tmp, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, path);
}

function freshConfig() {
  const pin = newPin();
  const config = {
    nodeName: 'Aula-Semilla',
    pin,
    createdAt: new Date().toISOString(),
    sessionSecret: randomBytes(32).toString('hex'),
  };
  writeConfig(CONFIG_PATH, config);
  console.log(`[semilla] PIN del panel docente (se muestra solo esta vez): ${pin}`);
  return config;
}

/**
 * Nunca hay un PIN por defecto: si falta o es inválido se genera uno nuevo y se
 * avisa. Un valor fijo sería una puerta abierta en la red del aula.
 */
export function loadConfig() {
  ensureDataDir();

  if (!existsSync(CONFIG_PATH)) return freshConfig();

  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    try {
      renameSync(CONFIG_PATH, `${CONFIG_PATH}.corrupto`);
    } catch {
      /* si no se puede apartar, se sobrescribe igualmente */
    }
    console.warn('[semilla] config.json ilegible: se ha apartado y se genera una configuración nueva');
    return freshConfig();
  }

  let changed = false;
  const config = {
    nodeName: raw.nodeName ?? 'Aula-Semilla',
    pin: String(raw.pin ?? ''),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    sessionSecret: raw.sessionSecret ?? '',
  };

  if (!/^\d{6}$/.test(config.pin)) {
    config.pin = newPin();
    changed = true;
    console.log(`[semilla] PIN regenerado (se muestra solo esta vez): ${config.pin}`);
  }
  if (!/^[0-9a-f]{64}$/.test(config.sessionSecret)) {
    config.sessionSecret = randomBytes(32).toString('hex');
    changed = true;
  }
  if (changed) writeConfig(CONFIG_PATH, config);

  return config;
}
