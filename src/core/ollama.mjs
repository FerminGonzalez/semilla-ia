import { OLLAMA_URL, runtime } from './config.mjs';
import { store } from './store.mjs';

const MB = 1024 * 1024;

export async function isAvailable(timeoutMs = 900) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Genera con el modelo local y entrega los tokens según llegan.
 * Mide tokens/s reales con los datos que devuelve Ollama al final.
 */
export async function streamGenerate({ system, prompt, onToken, signal, maxTokens = 320 }) {
  const started = Date.now();
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: runtime.model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      options: {
        temperature: 0.4,
        top_p: 0.9,
        num_predict: maxTokens,
        num_ctx: 2048,
      },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let final = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line === '') continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.message?.content) {
          text += chunk.message.content;
          onToken?.(chunk.message.content);
        }
        if (chunk.done) final = chunk;
      } catch {
        /* línea incompleta: se ignora y sigue */
      }
    }
  }

  const elapsedMs = Date.now() - started;
  const evalCount = final?.eval_count ?? null;
  const evalDurationNs = final?.eval_duration ?? null;
  const tokensPerSecond =
    evalCount && evalDurationNs ? Math.round((evalCount / (evalDurationNs / 1e9)) * 10) / 10 : null;

  store.recordMeasurement({
    llmTokensPerSecond: tokensPerSecond,
    llmLastAt: new Date().toISOString(),
    llmLastLatencyMs: elapsedMs,
  });
  store.count('llm');

  return { text, elapsedMs, tokensPerSecond, evalCount, model: runtime.model };
}

/** Generación corta sin streaming, para tareas auxiliares. */
export async function generateOnce({ system, prompt, maxTokens = 180, timeoutMs = 90_000 }) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: runtime.model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      options: { temperature: 0.3, num_predict: maxTokens, num_ctx: 2048 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json();
  return data.message?.content?.trim() ?? '';
}

export async function modelMemoryMb() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(900) });
    if (!response.ok) return null;
    const data = await response.json();
    const running = (data.models ?? []).find((item) => item.name === runtime.model);
    return running?.size ? Math.round(running.size / MB) : null;
  } catch {
    return null;
  }
}

