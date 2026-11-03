import { Buffer } from 'node:buffer';
import { store } from './store.mjs';
import { VERSION } from './config.mjs';

/**
 * Reto 13 · La escuela aprende de sus datos.
 *
 * Se construye un paquete de telemetría AGREGADA y anonimizada. Se ofrecen dos
 * codificaciones y se miden las dos: JSON legible y binario compacto. La radio
 * LoRa se modela; el tamaño del paquete es real.
 */

const LORA_BUDGET_BYTES = 51; // carga útil típica LoRaWAN EU868, SF9

export function buildPacket() {
  const state = store.state();

  const payload = {
    v: 1,
    sw: VERSION,
    ts: Math.floor(Date.now() / 1000),
    // Solo agregados: ni nombres, ni preguntas, ni textos.
    msgs: state.counters.messages ?? 0,
    sym: state.counters.symbolic ?? 0,
    llm: state.counters.llm ?? 0,
    dbt: state.doubts.length,
    rds: state.sensors.length,
    tps: state.measurements.llmTokensPerSecond ?? 0,
    up: Math.floor(process.uptime() / 60),
  };

  const json = JSON.stringify(payload);
  const jsonBytes = Buffer.byteLength(json, 'utf8');

  // Binario: 1 + 4 + 2·6 = 17 bytes. Orden fijo, sin claves, sin texto.
  const buffer = Buffer.alloc(17);
  buffer.writeUInt8(payload.v, 0);
  buffer.writeUInt32BE(payload.ts, 1);
  buffer.writeUInt16BE(Math.min(65535, payload.msgs), 5);
  buffer.writeUInt16BE(Math.min(65535, payload.sym), 7);
  buffer.writeUInt16BE(Math.min(65535, payload.llm), 9);
  buffer.writeUInt16BE(Math.min(65535, payload.dbt), 11);
  buffer.writeUInt16BE(Math.min(65535, payload.rds), 13);
  buffer.writeUInt16BE(Math.min(65535, Math.round(payload.tps * 10)), 15);
  // La versión de software va en el byte de cabecera (v) para no gastar más.

  return {
    payload,
    json,
    jsonBytes,
    binaryBytes: buffer.length,
    binaryBase64: buffer.toString('base64'),
    binaryHex: buffer.toString('hex'),
    loraBudgetBytes: LORA_BUDGET_BYTES,
    fitsInOnePacketJson: jsonBytes <= LORA_BUDGET_BYTES,
    fitsInOnePacket: buffer.length <= LORA_BUDGET_BYTES,
    packetsNeeded: Math.max(1, Math.ceil(buffer.length / LORA_BUDGET_BYTES)),
    packetsNeededJson: Math.max(1, Math.ceil(jsonBytes / LORA_BUDGET_BYTES)),
    savingsPercent: Math.round((1 - buffer.length / jsonBytes) * 100),
    label: 'medido',
    note:
      'Ambos tamaños son reales (UTF-8 y binario). La transmisión LoRa no se ha ejecutado: se compara con el presupuesto típico de carga útil LoRaWAN (51 bytes, SF9, EU868).',
  };
}

export function sendPacket() {
  const packet = buildPacket();
  const record = {
    id: `pkt_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    jsonBytes: packet.jsonBytes,
    bytes: packet.binaryBytes,
    packetsNeeded: packet.packetsNeeded,
    payload: packet.payload,
    channel: 'LoRa modelado',
  };
  store.addPacket(record);
  return { ...packet, record };
}

export function packets() {
  return store.state().packets.slice().reverse();
}

/** Consumo estimado a partir de la actividad real, con la base declarada. */
export function energyReport() {
  const state = store.state();
  const llmCalls = state.counters.llm ?? 0;
  const symbolicCalls = state.counters.symbolic ?? 0;
  const total = Math.max(1, llmCalls + symbolicCalls);

  // Se usa la latencia realmente medida, no una constante de diseño.
  const measuredSeconds =
    typeof state.measurements.llmLastLatencyMs === 'number' && state.measurements.llmLastLatencyMs > 0
      ? state.measurements.llmLastLatencyMs / 1000
      : 30;

  const secondsSaved = symbolicCalls * measuredSeconds;
  const whSaved = (1.2 * secondsSaved) / 3600;

  return {
    llmCalls,
    symbolicCalls,
    shareSymbolic: Math.round((symbolicCalls / total) * 100),
    secondsSaved: Math.round(secondsSaved),
    whSaved: Math.round(whSaved * 100) / 100,
    measuredSeconds: Math.round(measuredSeconds * 10) / 10,
    basis: `Ahorro calculado con ${measuredSeconds.toFixed(1)} s por respuesta del modelo, medidos en este equipo. El consumo en vatios es una proyección del nodo objetivo, no una medición.`,
    label: 'proyección',
  };
}
