import { el, getJson, postJson, toast, tag, fmtBytes, fmtDate, svg } from '../lib/dom.js';

export async function renderHardware(root) {
  const [sensors, telemetry, profile, teacherStatus] = await Promise.all([
    getJson('/api/sensors'),
    getJson('/api/telemetry'),
    getJson('/api/profile'),
    getJson('/api/teacher/status'),
  ]);

  root.append(
    el(
      'header',
      { class: 'page-head' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'Retos 13 y 17 · Datos y radio' }),
        el('h1', { text: 'Nodo físico' }),
        el('p', {
          text: 'Lo que el nodo mide, lo que proyecta y lo que envía. Todo separado para que se pueda auditar.',
        }),
      ),
      el('div', { class: 'row' }, tag('medido en local', 'ok'), tag('sin salida a internet', 'ok')),
    ),
  );

  /* ------------------------------ sensores ------------------------------- */
  const analysisBox = el('div', {});
  const reading = sensors.latest;

  const form = el('div', { class: 'grid grid-3' });
  const tempInput = el('input', { type: 'number', step: '0.1', value: reading?.temperature ?? 27, 'aria-label': 'Temperatura en grados' });
  const humInput = el('input', { type: 'number', step: '1', value: reading?.humidity ?? 45, 'aria-label': 'Humedad relativa' });
  const lightInput = el('input', { type: 'number', step: '100', value: reading?.light ?? 12000, 'aria-label': 'Luz en lux' });
  form.append(
    el('label', { class: 'field' }, el('span', { text: 'Temperatura (°C)' }), tempInput),
    el('label', { class: 'field' }, el('span', { text: 'Humedad (%)' }), humInput),
    el('label', { class: 'field' }, el('span', { text: 'Luz (lux)' }), lightInput),
  );

  const sendReading = el('button', {
    type: 'button',
    class: 'btn btn-primary',
    text: 'Registrar lectura',
    onclick: async () => {
      try {
        const result = await postJson('/api/sensors', {
          temperature: Number(tempInput.value),
          humidity: Number(humInput.value),
          light: Number(lightInput.value),
          device: 'formulario-aula',
        });
        analysisBox.replaceChildren(analysisBlock(result.analysis));
        toast('Lectura registrada');
        await refreshChart();
      } catch (error) {
        toast(error.message, 'error');
      }
    },
  });

  const simulate = el('button', {
    type: 'button',
    class: 'btn btn-ghost',
    text: 'Cargar serie de 24 h (simulada)',
    onclick: async () => {
      try {
        for (const point of sensors.simulated) {
          await postJson('/api/sensors', { ...point, source: 'simulado' });
        }
        await refreshChart();
        toast('Serie simulada cargada · etiquetada como simulada');
      } catch (error) {
        toast(error.message, 'error');
      }
    },
  });

  const chartBox = el('div', { class: 'chart-wrap' });

  async function refreshChart() {
    const data = await getJson('/api/sensors');
    chartBox.replaceChildren(chart(data.history.length > 0 ? data.history : data.simulated));
  }

  if (reading) analysisBox.append(analysisBlock({
    phenomenon: reading.temperature >= 28 && reading.humidity <= 40 ? 'aire caliente y seco' : 'lectura registrada',
    question: '¿Qué relación tiene esta lectura con lo que ves fuera?',
    experiment: ['Anota la lectura cada hora.', 'Compara con lo que ocurre en el patio.', 'Escribe una conclusión con tus palabras.'],
    explanation: 'Los datos del sensor permiten formular hipótesis comprobables en lugar de suposiciones.',
    observed: reading,
    label: reading.source === 'simulado' ? 'serie simulada' : 'medido por el sensor',
    simulated: reading.source === 'simulado',
  }));

  root.append(
    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Reto 17 · Laboratorio sin laboratorio' }),
      el('p', {
        class: 'small muted',
        text: 'Un ESP32 envía la lectura por HTTP en diez líneas de código. Sin hardware, este formulario hace lo mismo y queda etiquetado como lo que es.',
      }),
      form,
      el('div', { class: 'row' }, sendReading, simulate, tag('POST /api/sensors', 'info')),
      chartBox,
      analysisBox,
    ),
  );

  /* ---------------------------- energía y radio --------------------------- */
  const packet = telemetry.packet;
  const energy = telemetry.energy;
  const sendButton = el('button', {
    type: 'button',
    class: 'btn btn-secondary btn-sm',
    text: teacherStatus.authenticated ? 'Generar paquete de telemetría' : 'Generar paquete (requiere PIN)',
    onclick: async () => {
      try {
        const result = await postJson('/api/telemetry/send', {});
        toast(`Paquete de ${result.bytes} bytes generado`);
        root.replaceChildren();
        await renderHardware(root);
      } catch (error) {
        toast(error.message, 'error');
      }
    },
  });

  root.append(
    el(
      'div',
      { class: 'grid grid-2' },
      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Energía y reparto de trabajo' }),
        el(
          'div',
          { class: 'grid grid-2' },
          el('div', {}, el('span', { class: 'metric-label', text: 'Consultas sin modelo' }), el('p', { class: 'mono', text: `${energy.shareSymbolic} %` })),
          el('div', {}, el('span', { class: 'metric-label', text: 'Inferencia evitada' }), el('p', { class: 'mono', text: `${energy.secondsSaved} s` })),
          el('div', {}, el('span', { class: 'metric-label', text: 'Ahorro proyectado' }), el('p', { class: 'mono', text: `${energy.whSaved} Wh` })),
          el('div', {}, el('span', { class: 'metric-label', text: 'Consumo del nodo' }), el('p', { class: 'mono', text: `${profile.power.watts} W` })),
        ),
        el('p', { class: 'tiny muted', text: energy.basis }),
        el(
          'div',
          { class: 'row' },
          tag('proyección', 'projection'),
          tag(`modelo ${profile.model.model ?? 'no disponible'}`, profile.model.available ? 'ok' : 'warn'),
        ),
      ),

      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Reto 13 · Paquete federado' }),
        el('p', {
          class: 'small muted',
          text: 'Solo agregados: contadores, no conversaciones. El mismo dato en dos codificaciones, con su tamaño real.',
        }),
        el(
          'div',
          { class: 'grid grid-4' },
          el('div', {}, el('span', { class: 'metric-label', text: 'JSON legible' }), el('p', { class: 'mono', text: `${packet.jsonBytes} B` })),
          el('div', {}, el('span', { class: 'metric-label', text: 'Binario' }), el('p', { class: 'mono', text: `${packet.binaryBytes} B` })),
          el('div', {}, el('span', { class: 'metric-label', text: 'Ahorro' }), el('p', { class: 'mono', text: `${packet.savingsPercent} %` })),
          el('div', {}, el('span', { class: 'metric-label', text: 'Presupuesto LoRa' }), el('p', { class: 'mono', text: `${packet.loraBudgetBytes} B` })),
        ),
        packet.fitsInOnePacket
          ? el('p', { class: 'notice notice-ok', text: `Cabe en un único paquete LoRaWAN: ${packet.binaryBytes} B de ${packet.loraBudgetBytes} B disponibles.` })
          : el('p', { class: 'notice notice-warn', text: `Necesita ${packet.packetsNeeded} paquetes.` }),
        packet.fitsInOnePacketJson
          ? null
          : el('p', {
              class: 'small muted',
              text: `En JSON harían falta ${packet.packetsNeededJson} paquetes (${packet.jsonBytes} B). La codificación binaria es lo que hace viable la radio.`,
            }),
        el('pre', { class: 'packet', text: `JSON  ${packet.jsonBytes} B\n${packet.json}\n\nBINARIO ${packet.binaryBytes} B\n${packet.binaryHex.replace(/(..)/g, '$1 ').trim()}\nbase64: ${packet.binaryBase64}` }),
        el('p', { class: 'tiny muted', text: packet.note }),
        el('div', { class: 'row' }, sendButton),
      ),
    ),
  );

  if (telemetry.history.length > 0) {
    root.append(
      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Paquetes generados' }),
        el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            {},
            el('thead', {}, el('tr', {}, el('th', { text: 'Cuándo' }), el('th', { text: 'Bytes' }), el('th', { text: 'Paquetes' }), el('th', { text: 'Canal' }))),
            el(
              'tbody',
              {},
              telemetry.history.map((item) =>
                el(
                  'tr',
                  {},
                  el('td', { text: fmtDate(item.at) }),
                  el('td', { class: 'mono', text: String(item.bytes) }),
                  el('td', { class: 'mono', text: String(item.packetsNeeded) }),
                  el('td', { class: 'small muted', text: item.channel }),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  await refreshChart();
}

function legendSource(points) {
  const counts = { medido: 0, manual: 0, simulado: 0 };
  for (const point of points) {
    if (point?.source in counts) counts[point.source] += 1;
  }
  const parts = [];
  if (counts.medido) parts.push(`${counts.medido} ${counts.medido === 1 ? 'del sensor' : 'del sensor'}`);
  if (counts.manual) parts.push(`${counts.manual} ${counts.manual === 1 ? 'manual' : 'manuales'}`);
  if (counts.simulado) parts.push(`${counts.simulado} ${counts.simulado === 1 ? 'simulada' : 'simuladas'}`);
  if (parts.length === 0) return 'sin lecturas todavía';
  if (parts.length === 1) {
    if (counts.simulado) return 'serie simulada · no medida';
    if (counts.manual) return 'registro manual del docente';
    return 'lecturas del sensor';
  }
  return `mezcla: ${parts.join(' · ')}`;
}

function analysisBlock(analysis) {
  return el(
    'div',
    { class: 'stack mt-1' },
    el(
      'div',
      { class: 'notice notice-info' },
      el('strong', { text: `Fenómeno observado: ${analysis.phenomenon}. ` }),
      el('span', { text: analysis.label ?? '' }),
    ),
    el('p', {}, el('strong', { text: 'Pregunta para el alumno: ' }), analysis.question),
    el('p', { class: 'small muted', text: analysis.explanation }),
    el(
      'div',
      {},
      el('h3', { text: 'Andamiaje del método científico' }),
      el('ol', {}, analysis.experiment.map((step) => el('li', { text: step }))),
    ),
    el(
      'p',
      { class: 'tiny muted' },
      `Lectura: ${analysis.observed.temperature ?? '—'} °C · ${analysis.observed.humidity ?? '—'} % · ${analysis.observed.light ?? '—'} lux`,
    ),
  );
}

function chart(series) {
  const width = 640;
  const height = 150;
  const padding = 26;
  const points = series.slice(-48);

  const temps = points.map((p) => p.temperature);
  const minT = Math.min(...temps, 0);
  const maxT = Math.max(...temps, 30);
  const scaleX = (index) => padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2);
  const scaleY = (value) => height - padding - ((value - minT) / Math.max(1, maxT - minT)) * (height - padding * 2);

  const canvas = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Serie de ${points.length} lecturas de temperatura y humedad`,
  });

  for (let i = 0; i <= 3; i += 1) {
    const y = padding + (i / 3) * (height - padding * 2);
    canvas.append(svg('line', { x1: padding, y1: y, x2: width - padding, y2: y, stroke: '#e4ddca', 'stroke-width': 1 }));
  }

  const tempPath = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${scaleX(index)},${scaleY(point.temperature)}`).join(' ');
  const humPath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${scaleX(index)},${scaleY(point.humidity / 2)}`)
    .join(' ');

  canvas.append(svg('path', { d: tempPath, fill: 'none', stroke: '#a45a09', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
  canvas.append(svg('path', { d: humPath, fill: 'none', stroke: '#2f5d8a', 'stroke-width': 2, 'stroke-dasharray': '5 4' }));

  const last = points[points.length - 1];
  if (last) {
    canvas.append(
      svg('text', {
        x: width - padding,
        y: scaleY(last.temperature) - 8,
        'text-anchor': 'end',
        'font-size': 11,
        fill: '#a45a09',
        'font-family': 'ui-monospace, monospace',
      }, `${last.temperature} °C`),
    );
  }

  return el(
    'div',
    {},
    canvas,
    el(
      'div',
      { class: 'legend' },
      el('span', {}, el('i', { style: 'background:#a45a09' }), 'Temperatura °C'),
      el('span', {}, el('i', { style: 'background:#2f5d8a' }), 'Humedad % (escalada)'),
      el('span', { class: 'tiny' }, legendSource(points)),
    ),
  );
}
