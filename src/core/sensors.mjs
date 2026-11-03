import { store } from './store.mjs';

/**
 * Reto 17 · Laboratorio sin laboratorio.
 * El sensor entra por HTTP (un ESP32 o un Arduino con wifi lo hace en 10 líneas)
 * o por consola. Si no hay hardware, el nodo genera una serie plausible y lo
 * dice: nunca presenta datos simulados como medidos.
 */

const LIMITS = {
  temperature: { min: -20, max: 60, unit: '°C' },
  humidity: { min: 0, max: 100, unit: '%' },
  light: { min: 0, max: 120000, unit: 'lux' },
};

export function validateReading(input) {
  const raw = {
    temperature: input.temperature,
    humidity: input.humidity,
    light: input.light,
  };

  const errors = [];
  const reading = {};

  for (const [key, limit] of Object.entries(LIMITS)) {
    const value = raw[key];
    // Number('') === 0: un campo vacío no puede convertirse en una lectura válida.
    if (value === '' || value === null || value === undefined) {
      errors.push(`${key} está vacío`);
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      errors.push(`${key} no es un número válido`);
      continue;
    }
    if (numeric < limit.min || numeric > limit.max) {
      errors.push(`${key} fuera de rango (${limit.min}..${limit.max} ${limit.unit})`);
      continue;
    }
    reading[key] = numeric;
  }

  if (errors.length > 0) return { ok: false, errors };

  const source =
    input.source === 'simulado' ? 'simulado' : input.device === 'formulario-aula' ? 'manual' : 'medido';

  return {
    ok: true,
    reading: {
      ...reading,
      device: String(input.device ?? 'sensor-genérico').slice(0, 40),
      source,
      at: new Date().toISOString(),
    },
  };
}

export function recordReading(input) {
  const result = validateReading(input);
  if (!result.ok) return result;
  store.addSensor(result.reading);
  const analysis = analyse(result.reading, { simulated: result.reading.source === 'simulado' });
  return { ok: true, reading: result.reading, analysis };
}

export function latest() {
  const list = store.state().sensors;
  return list.length > 0 ? list[list.length - 1] : null;
}

export function history(limit = 60) {
  const list = store.state().sensors;
  return list.slice(-limit);
}

/** Serie de 24 h para demostrar la gráfica sin hardware conectado. */
export function simulatedSeries(points = 24) {
  const now = Date.now();
  return Array.from({ length: points }, (_, index) => {
    const hourOffset = points - 1 - index;
    const hour = new Date(now - hourOffset * 3600_000).getHours();
    const dayCurve = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    return {
      at: new Date(now - hourOffset * 3600_000).toISOString(),
      temperature: Math.round((16 + dayCurve * 14) * 10) / 10,
      humidity: Math.round(78 - dayCurve * 34),
      light: Math.round(dayCurve * 42000),
      device: 'serie-simulada',
      source: 'simulado',
    };
  });
}

export function analyse(reading, { simulated = false } = {}) {
  const { temperature, humidity, light } = reading;
  const hot = temperature >= 28;
  const dry = humidity <= 40;
  const bright = light >= 8000;

  let phenomenon = 'condiciones templadas';
  let question = '¿Qué cambia en el patio entre la mañana y la tarde?';
  let experiment = [
    'Dos platos iguales con la misma agua, uno al sol y otro a la sombra.',
    'Anota el nivel cada hora junto a la lectura del sensor.',
    'Compara: ¿qué plato pierde agua antes?',
  ];
  let explanation =
    'El agua pasa a vapor cuando recibe energía. A más calor y menos humedad, más rápida es la evaporación.';

  if (hot && dry) {
    phenomenon = 'aire caliente y seco';
    question = '¿Por qué se seca la ropa antes en un día así?';
  } else if (!bright) {
    phenomenon = 'poca luz';
    question = '¿Por qué las hojas de una planta en sombra pierden color?';
    experiment = [
      'Tapa una hoja de una planta con cartón durante tres días.',
      'Riega las dos hojas por igual.',
      'Compara el color con la lectura de luz del sensor.',
    ];
    explanation =
      'Sin luz no hay fotosíntesis: la planta no puede fabricar su alimento y la hoja amarillea.';
  } else if (humidity >= 75) {
    phenomenon = 'ambiente húmedo';
    question = '¿Por qué el agua se seca más despacio hoy?';
  }

  return {
    phenomenon,
    question,
    experiment,
    explanation,
    observed: { temperature, humidity, light },
    simulated,
    label: simulated
      ? 'serie simulada'
      : reading.source === 'manual'
        ? 'registro manual del docente'
        : 'medido por el sensor',
  };
}
