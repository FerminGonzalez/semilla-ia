import os from 'node:os';
import { HOST, OLLAMA_URL, PORT, VERSION, runtime } from './config.mjs';
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
    'Calculado a partir de 1,5·10⁹ pesos × 1,58 bits: es una proyección, no una medida. El prototipo sí ejecuta un modelo ternario propio, mucho menor (17 M de parámetros, 204 MB), medido aparte.',
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
    const model = (tags.models ?? []).find((item) => item.name === runtime.model);
    if (!model) {
      return { ...base, error: `el modelo ${runtime.model} no está descargado en este equipo` };
    }

    let loadedRamMb = null;
    try {
      const ps = await ollamaFetch('/api/ps');
      const running = (ps.models ?? []).find((item) => item.name === runtime.model);
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

/** Direcciones útiles para el cartel «conéctate a Aula-Semilla». */
export function lanAddresses() {
  const result = [];
  const isPrivate = (address) =>
    /^192\.168\./.test(address) ||
    /^10\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address);
  const isTailscale = (address) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address);
  // 192.168.56.0/24 es el rango por defecto del adaptador host-only de VirtualBox:
  // aparece con nombre "Ethernet 2" y no es alcanzable desde otros equipos.
  const isVirtualBoxOnly = (address) => /^192\.168\.56\./.test(address);

  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vmware|virtualbox|hyper-v|vethernet|loopback|bluetooth/i.test(name)) continue;
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      const address = item.address;
      if (isVirtualBoxOnly(address)) continue;
      if (!isPrivate(address) && !isTailscale(address)) continue;
      result.push({
        name,
        address,
        kind: /tailscale/i.test(name) || isTailscale(address) ? 'tailscale' : 'aula',
      });
    }
  }

  // Primero la red del aula, después la red privada virtual.
  return result.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'aula' ? -1 : 1));
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
    // Solo se publica la red local cuando el nodo está en modo aula.
    sharing: {
      enabled: HOST === '0.0.0.0',
      port: PORT,
      addresses: HOST === '0.0.0.0' ? lanAddresses() : [],
    },
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  };
}

/** Modelos locales disponibles. Los `:cloud` se excluyen: exigen internet. */
export async function listModels() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    return (data.models ?? [])
      // Los modelos remotos de Ollama llevan «cloud» en el nombre y exigen internet.
      .filter((item) => !/cloud/i.test(String(item.name)))
      .map((item) => ({
        name: item.name,
        sizeMb: item.size ? Math.round(item.size / MB) : null,
        parameters: item.details?.parameter_size ?? null,
        quantization: item.details?.quantization_level ?? null,
        family: item.details?.family ?? null,
        active: item.name === runtime.model,
      }))
      .sort((a, b) => (a.sizeMb ?? 0) - (b.sizeMb ?? 0));
  } catch {
    return [];
  }
}

/** Arranque del modelo para que la primera respuesta no pague la carga. */
export function prewarmModel() {
  // Se hace por HTTP: la CLI depende de la versión y del intérprete de turno.
  fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: runtime.model,
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

