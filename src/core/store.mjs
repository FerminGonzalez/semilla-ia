import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR, ensureDataDir } from './config.mjs';

const STORE_PATH = resolve(DATA_DIR, 'nodo.json');
const MAX_DOUBTS = 400;
const MAX_SENSORS = 240;
const MAX_PACKETS = 60;

const EMPTY = {
  createdAt: new Date().toISOString(),
  doubts: [],
  sensors: [],
  packets: [],
  counters: { messages: 0, symbolic: 0, llm: 0, transcodes: 0, exercises: 0 },
  measurements: { llmTokensPerSecond: null, llmLastAt: null, llmLastLatencyMs: null },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let cache = null;

function load() {
  if (cache) return cache;
  ensureDataDir();
  if (!existsSync(STORE_PATH)) {
    cache = clone(EMPTY);
    persist(cache);
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
    cache = { ...clone(EMPTY), ...raw };
    cache.counters = { ...EMPTY.counters, ...(raw.counters ?? {}) };
    cache.measurements = { ...EMPTY.measurements, ...(raw.measurements ?? {}) };
    cache.doubts ??= [];
    cache.sensors ??= [];
    cache.packets ??= [];
    if (purgeExpired(cache)) persist(cache);
  } catch {
    // Un JSON corrupto no puede tumbar el nodo: se aparta y se empieza limpio.
    try {
      renameSync(STORE_PATH, `${STORE_PATH}.corrupto`);
    } catch {
      /* sin permisos: se ignora */
    }
    cache = clone(EMPTY);
    persist(cache);
  }
  return cache;
}

/** Escritura atómica: si el nodo pierde la luz a mitad, el fichero no queda roto. */
function persist(state) {
  const tmp = `${STORE_PATH}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, STORE_PATH);
  } catch (error) {
    // Un disco lleno o un antivirus no pueden tumbar el aula.
    console.error('[semilla] no se pudo guardar el estado:', error?.code ?? error?.message ?? error);
  }
}

const DOUBT_TTL_MS = 30 * 24 * 3600 * 1000;

/** Las dudas de menores no se guardan para siempre. */
function purgeExpired(state) {
  const limit = Date.now() - DOUBT_TTL_MS;
  const before = state.doubts.length;
  state.doubts = state.doubts.filter((doubt) => {
    const at = Date.parse(doubt?.at ?? '');
    return Number.isFinite(at) ? at >= limit : false;
  });
  return before !== state.doubts.length;
}

let pendingSave = null;

function schedule() {
  if (pendingSave) return;
  pendingSave = setTimeout(() => {
    pendingSave = null;
    persist(cache);
  }, 400);
}

export const store = {
  state() {
    return load();
  },

  addDoubts(entries) {
    const state = load();
    const now = new Date().toISOString();
    for (const entry of entries) {
      state.doubts.push({ ...entry, at: now });
    }
    if (state.doubts.length > MAX_DOUBTS) {
      state.doubts = state.doubts.slice(-MAX_DOUBTS);
    }
    schedule();
  },

  addSensor(reading) {
    const state = load();
    state.sensors.push(reading);
    if (state.sensors.length > MAX_SENSORS) state.sensors = state.sensors.slice(-MAX_SENSORS);
    schedule();
  },

  addPacket(packet) {
    const state = load();
    state.packets.push(packet);
    if (state.packets.length > MAX_PACKETS) state.packets = state.packets.slice(-MAX_PACKETS);
    schedule();
  },

  count(name, by = 1) {
    const state = load();
    state.counters[name] = (state.counters[name] ?? 0) + by;
    schedule();
  },

  recordMeasurement(patch) {
    const state = load();
    state.measurements = { ...state.measurements, ...patch };
    schedule();
  },

  reset() {
    cache = clone(EMPTY);
    persist(cache);
  },

  flush() {
    if (pendingSave) {
      clearTimeout(pendingSave);
      pendingSave = null;
    }
    if (cache) persist(cache);
  },
};
