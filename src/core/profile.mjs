import os from 'node:os';
import { OLLAMA_MODEL, OLLAMA_URL, VERSION } from './config.mjs';
import { store } from './store.mjs';

const MB = 1024 * 1024;

export function hardware() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    cpu: cpus[0]?.model?.trim() ?? 'desconocido',
    cores: cpus.length,
    totalRamMb: Math.round(os.totalmem() / MB),
    freeRamMb: Math.round(os.freemem() / MB),
    uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
    measuredAt: new Date().toISOString(),
  };
}

export function processMetrics() {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round(usage.rss / MB),
    heapUsedMb: Math.round(usage.heapUsed / MB),
    nodeVersion: process.version,
  };
}

/**
 * Las cifras del hardware objetivo son PROYECCIONES, no medidas.
 * Se devuelven separadas para que la interfaz no pueda confundirlas.
 */
export const PROJECTION = {
  target: 'SoC RISC-V con NPU entera + 512 MB LPDDR4',
  modelParamsBillions: 1.5,
  bitsPerWeight: 1.58,
  modelSizeMb: Math.round((1.5e9 * 1.58) / 8 / MB),
  workingSetMb: 380,
  powerWatts: 1.2,
  costUsd: 12,
  bootSeconds: 5,
  capsuleGrams: 100,
  label: 'proyección',
  note:
    'Calculado a partir de 1,5·10⁹ pesos × 1,58 bits. No se ha ejecutado un modelo ternario en este prototipo.',
};

async function ollamaFetch(path, timeoutMs = 1200) {
  const response = await fetch(`${OLLAMA_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  return response.json();
}

export async function modelStatus() {
  const base = {
    engine: 'symbolic',
    provider: 'motor local determinista',
    model: null,
    available: false,
    sizeMb: null,
    loadedRamMb: null,
  };

  try {
    const tags = await ollamaFetch('/api/tags');
    const model = (tags.models ?? []).find((item) => item.name === OLLAMA_MODEL);
    if (!model) {
      return { ...base, error: `el modelo ${OLLAMA_MODEL} no está descargado en este equipo` };
    }

    let loadedRamMb = null;
    try {
      const ps = await ollamaFetch('/api/ps');
      const running = (ps.models ?? []).find((item) => item.name === OLLAMA_MODEL);
      if (running?.size) loadedRamMb = Math.round(running.size / MB);
    } catch {
      /* /api/ps puede no estar disponible en versiones antiguas */
    }

    return {
      engine: 'llm',
      provider: 'Ollama · inferencia local',
      model: model.name,
      available: true,
      sizeMb: model.size ? Math.round(model.size / MB) : null,
      loadedRamMb,
      family: model.details?.family ?? null,
      parameters: model.details?.parameter_size ?? null,
      quantization: model.details?.quantization_level ?? null,
    };
  } catch {
    return { ...base, error: 'el servicio de inferencia local no responde' };
  }
}

/** Direcciones IPv4 no internas, para el cartel «conéctate a Aula-Semilla». */
export function lanAddresses() {
  const result = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) result.push({ name, address: item.address });
    }
  }
  return result;
}

export function powerEstimate(activeModelLoaded) {
  // Estimación de consumo del nodo objetivo, no una medida del portátil.
  const base = PROJECTION.powerWatts;
  return {
    watts: activeModelLoaded ? base : Math.round(base * 0.45 * 10) / 10,
    basis: activeModelLoaded ? 'modelo cargado en RAM' : 'reposo, solo motor simbólico',
    label: 'estimación',
    measured: false,
  };
}

export async function nodeSnapshot() {
  const model = await modelStatus();
  const state = store.state();
  return {
    version: VERSION,
    app: 'Semilla-IA',
    hardware: hardware(),
    process: processMetrics(),
    model,
    power: powerEstimate(model.engine === 'llm'),
    projection: PROJECTION,
    counters: state.counters,
    measurements: state.measurements,
    offline: true,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  };
}

/** Arranque del modelo para que la primera respuesta no pague la carga. */
export function prewarmModel() {
  // Se hace por HTTP: la CLI depende de la versión y del intérprete de turno.
  fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: 'hola',
      stream: false,
      keep_alive: '30m',
      options: { num_predict: 1 },
    }),
    signal: AbortSignal.timeout(90_000),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      console.log('[semilla] modelo precargado en memoria (keep_alive 30m)');
    })
    .catch((error) => {
      console.warn('[semilla] no se pudo precargar el modelo:', String(error.message).slice(0, 120));
    });
}
