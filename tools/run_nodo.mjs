#!/usr/bin/env node
/**
 * Arranque conjunto del sidecar BitNet propio y del nodo Semilla-IA.
 * - Lanza python tools/bitnet_server.py en el puerto 11435.
 * - Espera a que /api/tags responda (hasta 60 s).
 * - Arranca src/server.mjs con OLLAMA_URL apuntando al sidecar.
 * - Propaga SIGINT/SIGTERM a ambos hijos y a sus subprocesos.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BITNET_URL = 'http://127.0.0.1:11435';
const BITNET_START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

const children = [];
let shuttingDown = false;

function log(label, message) {
  console.log(`[semilla] ${label} ${message}`);
}

async function portInUse(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300);
    const response = await fetch(`http://127.0.0.1:${port}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function killTree(child, code = 0) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        detached: true,
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // ignorar
  }
}

function spawnChild(command, args, envExtra = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...envExtra },
    detached: false,
  });

  child.on('error', (err) => {
    console.error(`[semilla] no se pudo lanzar ${command}:`, err.message);
    shutdown(1);
  });

  children.push(child);
  return child;
}

async function waitForBitnet() {
  const start = Date.now();
  while (Date.now() - start < BITNET_START_TIMEOUT_MS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), POLL_INTERVAL_MS);
      const response = await fetch(`${BITNET_URL}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        const models = (data.models ?? []).map((m) => m.name);
        if (models.includes('bitnet-17m:ternario')) {
          log('motor propio (bitnet-17m) en :11435', `modelos: ${models.join(', ')}`);
          return true;
        }
      }
    } catch {
      // Aun no responde; reintentar.
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('deteniendo hijos...', '');
  for (const child of children) {
    killTree(child, exitCode);
  }
  setTimeout(() => process.exit(exitCode), 3000);
}

async function main() {
  const pythonScript = join(ROOT, 'tools', 'bitnet_server.py');
  if (!existsSync(pythonScript)) {
    console.error(`[semilla] no existe ${pythonScript}`);
    process.exit(1);
  }

  if (await portInUse(11435)) {
    console.error(
      '[semilla] el puerto 11435 ya esta en uso. Cierra el proceso anterior en :11435 antes de arrancar.'
    );
    process.exit(1);
  }

  const bitnet = spawnChild(process.platform === 'win32' ? 'python' : 'python3', [pythonScript]);

  bitnet.on('exit', (code) => {
    if (!shuttingDown) {
      log('motor bitnet termino', `codigo ${code ?? 'desconocido'}`);
      shutdown(code ?? 1);
    }
  });

  const ready = await waitForBitnet();
  if (!ready) {
    console.error('[semilla] el motor bitnet no arranco a tiempo');
    shutdown(1);
    return;
  }

  const server = spawnChild('node', ['src/server.mjs'], {
    OLLAMA_URL: BITNET_URL,
    // MVP: el único modelo servido es el motor propio. Así una instalación
    // sin data/config.json también arranca en bitnet-17m:ternario.
    OLLAMA_MODEL: 'bitnet-17m:ternario',
  });

  server.on('exit', (code) => {
    if (!shuttingDown) {
      log('nodo termino', `codigo ${code ?? 'desconocido'}`);
      shutdown(code ?? 1);
    }
  });

  log('nodo en :8090', 'listo');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (err) => {
  console.error('[semilla] error no capturado:', err);
  shutdown(1);
});

main().catch((err) => {
  console.error('[semilla] fallo en main():', err);
  shutdown(1);
});
