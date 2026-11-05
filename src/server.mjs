import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { WEB_DIR, HOST, PORT, VERSION, loadConfig, persistModel, runtime, IDIOMA_POR_DEFECTO, MODELO_AJUSTADO_RUTA, MODELO_AJUSTADO_TOKENIZER } from './core/config.mjs';
import { nodeSnapshot, prewarmModel, listModels } from './core/profile.mjs';
import { publicCartridges, getCartridge } from './core/cartridges.mjs';
import { chat, askFree, llmStatus } from './core/router.mjs';
import { transcode } from './core/transcoder.mjs';
import { generateExercises, checkAnswer } from './core/exercises.mjs';
import { teacherSummary, clearDoubts } from './core/teacher.mjs';
import { recordReading, latest, history, simulatedSeries } from './core/sensors.mjs';
import { buildPacket, sendPacket, packets, energyReport } from './core/telemetry.mjs';
import { store } from './core/store.mjs';
import { traducir, idiomasDisponibles, estadoModeloAjustado, conectarModeloAjustado, validarIdioma } from './core/translator.mjs';

const config = loadConfig();
const startedAt = Date.now();
let listenRetries = 0;

const CARTRIDGE_IDS = new Set(publicCartridges().map((item) => item.id));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

function fail(res, status, message, extraHeaders = {}) {
  json(res, status, { error: message }, extraHeaders);
}

function readJson(req, limitBytes = 200_000) {
  return new Promise((resolvePromise, reject) => {
    const type = String(req.headers['content-type'] ?? '').toLowerCase();
    if (type !== '' && !type.startsWith('application/json')) {
      reject(Object.assign(new Error('Se esperaba Content-Type: application/json'), { status: 415 }));
      req.resume();
      return;
    }

    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim() === '') return resolvePromise({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('Se esperaba un objeto JSON'), { status: 400 }));
        }
        resolvePromise(parsed);
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------ límites de uso ---------------------------- */

const buckets = new Map();

function rateLimit(ip, key, max, windowMs) {
  const now = Date.now();
  const id = `${key}:${ip}`;
  const entry = buckets.get(id) ?? { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + windowMs;
  }
  entry.count += 1;
  buckets.set(id, entry);
  return entry.count <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of buckets) {
    if (now > entry.reset) buckets.delete(id);
  }
}, 60_000).unref();

function clientIp(req) {
  return req.socket.remoteAddress ?? 'desconocido';
}

/* ----------------------------- sesión docente ----------------------------- */

function sign(exp) {
  return createHmac('sha256', config.sessionSecret).update(String(exp)).digest('hex').slice(0, 32);
}

const SESSION_PATTERN = /^(\d{1,16})\.([0-9a-f]{32})$/;

function isTeacher(req) {
  const cookie = req.headers.cookie ?? '';
  const match = cookie.match(/(?:^|;\s*)semilla_sesion=([^;]+)/);
  if (!match) return false;

  let raw;
  try {
    raw = decodeURIComponent(match[1]);
  } catch {
    return false;
  }

  const parsed = SESSION_PATTERN.exec(raw);
  if (!parsed) return false;

  const exp = Number(parsed[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expected = sign(exp);
  const given = parsed[2];
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function requireTeacher(req, res) {
  if (isTeacher(req)) return true;
  fail(res, 401, 'Necesitas el PIN del panel docente');
  return false;
}

function pinMatches(candidate) {
  const a = Buffer.from(String(candidate ?? ''));
  const b = Buffer.from(config.pin);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* -------------------------------- estáticos ------------------------------- */

async function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? '/index.html' : pathname;
  const target = resolve(join(WEB_DIR, normalize(relative)));

  if (target !== WEB_DIR && !target.startsWith(WEB_DIR + sep)) {
    return fail(res, 403, 'Ruta no permitida');
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) return fail(res, 404, 'No encontrado');
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    fail(res, 404, 'No encontrado');
  }
}

/* ---------------------------------- rutas --------------------------------- */

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method ?? 'GET';
  const ip = clientIp(req);

  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      app: 'Semilla-IA',
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      offline: true,
    });
  }

  if (pathname === '/api/profile') {
    return json(res, 200, await nodeSnapshot());
  }

  if (pathname === '/api/cartridges') {
    return json(res, 200, publicCartridges());
  }

  if (pathname === '/api/chat') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    if (!rateLimit(ip, 'chat', 30, 60_000)) {
      return fail(res, 429, 'Demasiadas preguntas seguidas. Espera un momento.', { 'Retry-After': '30' });
    }

    const body = await readJson(req);
    const message = String(body.message ?? '').slice(0, 2000);
    if (message.trim() === '') return fail(res, 400, 'Escribe una pregunta');

    const cartridgeId = String(body.cartridge ?? 'mate');
    if (!CARTRIDGE_IDS.has(cartridgeId)) return fail(res, 400, 'Cartucho desconocido');

    const sensor = latest();
    const grade = body.grade ? String(body.grade).slice(0, 20) : null;
    const topic = body.topic ? String(body.topic).slice(0, 120) : null;
    const engine = body.engine === 'symbolic' || body.engine === 'llm' ? body.engine : 'auto';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...SECURITY_HEADERS,
    });

    let closed = false;
    const sendEvent = (event, data) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // `close` en la respuesta es lo que detecta que el alumno pulsó «Detener»
    // o cerró la pestaña; en la petición ya se habría emitido al leer el cuerpo.
    const controller = new AbortController();
    res.on('close', () => {
      closed = true;
      if (!res.writableEnded) controller.abort();
    });

    const hardTimeout = setTimeout(() => controller.abort(), 150_000);
    hardTimeout.unref();

    try {
      const result = await chat({
        cartridgeId,
        message,
        grade,
        topic,
        sensor,
        engine,
        signal: controller.signal,
        onMeta: (meta) => sendEvent('meta', meta),
        onToken: (token) => sendEvent('token', { t: token }),
      });

      if (result.meta?.aborted) {
        sendEvent('done', { engine: result.engine, reason: result.reason, ms: result.ms, aborted: true });
        return undefined;
      }

      store.count('messages');
      sendEvent('done', {
        engine: result.engine,
        reason: result.reason,
        ms: result.ms,
        tokensPerSecond: result.tokensPerSecond ?? null,
        meta: result.meta ?? {},
      });
    } catch (error) {
      sendEvent('error', {
        message: error instanceof Error ? error.message : 'Fallo al responder',
      });
    } finally {
      clearTimeout(hardTimeout);
    }

    if (!res.writableEnded) res.end();
    return undefined;
  }

  if (pathname === '/api/models') {
    return json(res, 200, {
      active: runtime.model,
      models: await listModels(),
      llm: llmStatus(),
    });
  }

  if (pathname === '/api/models/active') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    const body = await readJson(req);
    const name = String(body.name ?? '').trim();

    if (llmStatus().inFlight > 0) {
      return fail(res, 409, 'Hay una consulta en curso. Espera a que termine para cambiar de modelo.');
    }

    const models = await listModels();
    const target = models.find((item) => item.name === name);
    if (!target) return fail(res, 404, 'Ese modelo no está disponible en el nodo');

    persistModel(target.name);
    // Se precarga el nuevo para que la primera pregunta no pague la carga.
    prewarmModel();

    return json(res, 200, { active: runtime.model, model: target });
  }

  if (pathname === '/api/idiomas') {
    return json(res, 200, {
      disponibles: idiomasDisponibles(),
      porDefecto: IDIOMA_POR_DEFECTO,
      modeloAjustado: estadoModeloAjustado(),
    });
  }

  if (pathname === '/api/traducir') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    const body = await readJson(req);
    const texto = String(body.texto ?? '').slice(0, 2000);
    if (texto.trim() === '') return fail(res, 400, 'Escribe un texto para traducir');
    const desde = String(body.desde ?? IDIOMA_POR_DEFECTO).toLowerCase();
    const hacia = String(body.hacia ?? 'es').toLowerCase();
    if (!validarIdioma(desde) || !validarIdioma(hacia)) {
      return fail(res, 400, 'Idioma no soportado. Usa es, ng o en.');
    }
    const resultado = traducir(texto, desde, hacia);
    return json(res, 200, resultado);
  }

  if (pathname === '/api/traducir/modelo-ajustado') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    const body = await readJson(req);
    const ruta = String(body.ruta ?? '').trim();
    if (!ruta) return fail(res, 400, 'Falta la ruta del checkpoint');
    const ok = conectarModeloAjustado({ rutaCheckpoint: ruta });
    return json(res, 200, { conectado: ok, estado: estadoModeloAjustado() });
  }

  if (pathname === '/api/ask') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    if (!rateLimit(ip, 'ask', 30, 60_000)) {
      return fail(res, 429, 'Demasiadas consultas seguidas. Espera un momento.', { 'Retry-After': '30' });
    }

    const body = await readJson(req);
    const message = String(body.message ?? '').slice(0, 2000);
    if (message.trim() === '') return fail(res, 400, 'Escribe una pregunta');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...SECURITY_HEADERS,
    });

    let closed = false;
    const sendEvent = (event, data) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const controller = new AbortController();
    res.on('close', () => {
      closed = true;
      if (!res.writableEnded) controller.abort();
    });
    const hardTimeout = setTimeout(() => controller.abort(), 180_000);
    hardTimeout.unref();

    try {
      const result = await askFree({
        message,
        signal: controller.signal,
        onMeta: (meta) => sendEvent('meta', meta),
        onToken: (token) => sendEvent('token', { t: token }),
      });

      if (controller.signal.aborted) {
        sendEvent('done', { aborted: true });
      } else {
        store.count('messages');
        sendEvent('done', {
          engine: result.engine,
          ms: result.ms,
          tokensPerSecond: result.tokensPerSecond ?? null,
          model: result.model,
        });
      }
    } catch (error) {
      sendEvent('error', {
        message:
          controller.signal.aborted
            ? 'Consulta detenida.'
            : error instanceof Error
              ? error.message
              : 'Fallo al responder',
      });
    } finally {
      clearTimeout(hardTimeout);
    }

    if (!res.writableEnded) res.end();
    return undefined;
  }

  if (pathname === '/api/transcode') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    const body = await readJson(req);
    const source = String(body.source ?? '').slice(0, 6000);
    if (source.trim().length < 20) {
      return fail(res, 400, 'Escribe al menos una frase para transcodificar');
    }
    const result = transcode({
      title: body.title ? String(body.title).slice(0, 120) : undefined,
      source,
      grade: body.grade ? String(body.grade).slice(0, 20) : undefined,
    });
    store.count('transcodes');
    return json(res, 200, result);
  }

  if (pathname === '/api/exercise') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    const body = await readJson(req);
    const result = generateExercises({
      topic: String(body.topic ?? '').slice(0, 120),
      grade: String(body.grade ?? '').slice(0, 20),
      count: Number(body.count ?? 4),
      seed: body.seed,
    });
    store.count('exercises');
    return json(res, 200, result);
  }

  if (pathname === '/api/exercise/check') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    const body = await readJson(req);
    return json(
      res,
      200,
      checkAnswer({
        seed: Number(body.seed),
        index: Number(body.index),
        answer: String(body.answer ?? '').slice(0, 200),
        topic: String(body.topic ?? ''),
        grade: String(body.grade ?? ''),
      }),
    );
  }

  if (pathname === '/api/teacher/status') {
    return json(res, 200, { authenticated: isTeacher(req) });
  }

  if (pathname === '/api/teacher/login') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    if (!rateLimit(ip, 'pin', 5, 10 * 60_000)) {
      return fail(res, 429, 'Demasiados intentos. Espera unos minutos.', { 'Retry-After': '600' });
    }

    const body = await readJson(req);
    if (!pinMatches(body.pin)) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
      return fail(res, 401, 'PIN incorrecto');
    }

    const exp = Date.now() + 8 * 3600_000;
    res.setHeader(
      'Set-Cookie',
      `semilla_sesion=${encodeURIComponent(`${exp}.${sign(exp)}`)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
    );
    return json(res, 200, { authenticated: true, expiresAt: new Date(exp).toISOString() });
  }

  if (pathname === '/api/teacher/logout') {
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    res.setHeader('Set-Cookie', 'semilla_sesion=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return json(res, 200, { authenticated: false });
  }

  if (pathname === '/api/teacher/summary') {
    if (!requireTeacher(req, res)) return undefined;
    return json(res, 200, teacherSummary());
  }

  if (pathname === '/api/teacher/doubts') {
    if (!requireTeacher(req, res)) return undefined;
    if (method !== 'DELETE') return fail(res, 405, 'Método no permitido');
    clearDoubts();
    return json(res, 200, { cleared: true });
  }

  if (pathname === '/api/sensors') {
    if (method === 'GET') {
      return json(res, 200, { latest: latest(), history: history(48), simulated: simulatedSeries() });
    }
    if (method === 'POST') {
      if (!rateLimit(ip, 'sensor', 120, 60_000)) {
        return fail(res, 429, 'Demasiadas lecturas por minuto', { 'Retry-After': '60' });
      }
      const body = await readJson(req);
      const result = recordReading(body);
      if (!result.ok) return fail(res, 400, result.errors.join('; '));
      return json(res, 201, result);
    }
    return fail(res, 405, 'Método no permitido');
  }

  if (pathname === '/api/telemetry') {
    return json(res, 200, {
      packet: buildPacket(),
      energy: energyReport(),
      history: packets(),
      counters: store.state().counters,
      measurements: store.state().measurements,
    });
  }

  if (pathname === '/api/telemetry/send') {
    if (!requireTeacher(req, res)) return undefined;
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    return json(res, 201, sendPacket());
  }

  if (pathname === '/api/node/reset') {
    if (!requireTeacher(req, res)) return undefined;
    if (method !== 'POST') return fail(res, 405, 'Método no permitido');
    store.reset();
    return json(res, 200, { reset: true });
  }

  return fail(res, 404, 'Ruta no encontrada');
}

/* --------------------------------- servidor -------------------------------- */

const server = http.createServer(async (req, res) => {
  // La base de la URL es constante: el encabezado Host no debe poder romper el
  // análisis ni tumbar el proceso, y solo se usa el pathname.
  let url;
  try {
    if (typeof req.url !== 'string' || !req.url.startsWith('/')) {
      throw new Error('petición inválida');
    }
    url = new URL(req.url, 'http://nodo.local');
  } catch {
    return fail(res, 400, 'Petición inválida');
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fail(res, 405, 'Método no permitido');
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    const status = error?.status ?? 500;
    if (status >= 500) {
      console.error('[semilla] error:', error instanceof Error ? error.message : error);
    }
    if (!res.headersSent) fail(res, status, error instanceof Error ? error.message : 'Error interno');
    else if (!res.writableEnded) res.end();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && listenRetries < 3) {
    listenRetries += 1;
    console.warn(`[semilla] puerto ${PORT} ocupado; reintento ${listenRetries}/3`);
    setTimeout(() => server.listen(PORT, HOST), 500);
    return;
  }
  console.error('[semilla] no se pudo arrancar:', error.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const lan = HOST === '0.0.0.0';
  console.log(`[semilla] Semilla-IA v${VERSION} escuchando en http://${lan ? '0.0.0.0' : HOST}:${PORT}`);
  console.log('[semilla] modo: 100% local · sin salida a internet');
  console.log('[semilla] panel docente protegido por PIN (en data/config.json)');
  // La primera respuesta del modelo paga la carga en memoria (20-30 s).
  prewarmModel();
});

// Una promesa rechazada sin capturar no debe matar el aula.
process.on('unhandledRejection', (reason) => {
  console.error('[semilla] promesa rechazada sin capturar:', reason);
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  store.flush();
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => store.flush());
