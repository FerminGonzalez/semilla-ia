/** Utilidades de DOM. Todo el texto entra por textContent: nunca innerHTML con datos. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // solo con cadenas propias y constantes
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') node.value = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function svg(tag, attrs = {}, ...children) {  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children.flat(4)) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** `replaceChildren` convierte null en el texto "null": este helper lo evita. */
export function setChildren(node, ...children) {
  node.replaceChildren(
    ...children
      .flat(4)
      .filter((child) => child !== null && child !== undefined && child !== false)
      .map((child) => (child instanceof Node ? child : document.createTextNode(String(child)))),
  );
}

export async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${response.status}`);
  }
  return response.json();
}

export async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
  return data;
}

export async function delJson(path) {
  const response = await fetch(path, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
  return data;
}

let toastTimer = null;
export function toast(message, kind = 'ok') {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.className = `toast toast-${kind} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.className = 'toast';
  }, 4200);
}

export function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

/**
 * Renderizador mínimo de texto enriquecido, construido con nodos reales.
 * Soporta **negrita**, listas (- y 1.), citas (>) y párrafos.
 */
export function renderRich(text) {
  const fragment = document.createDocumentFragment();
  const lines = String(text ?? '').split('\n');
  let list = null;

  const closeList = () => {
    if (list) {
      fragment.append(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      closeList();
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);

    if (bullet || ordered) {
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tagName.toLowerCase() !== tag) {
        closeList();
        list = document.createElement(tag);
      }
      const item = document.createElement('li');
      appendInline(item, (bullet ?? ordered)[1]);
      list.append(item);
      continue;
    }

    closeList();

    if (line.startsWith('> ')) {
      const quote = document.createElement('blockquote');
      appendInline(quote, line.slice(2));
      fragment.append(quote);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      // Los encabezados de chat empiezan en h2 para no saltarse el h1 de la
      // página. `#` → h2, `##` → h3, `###` → h4.
      const level = heading[1].length + 1;
      const node = document.createElement(`h${level}`);
      appendInline(node, heading[2]);
      fragment.append(node);
      continue;
    }

    const paragraph = document.createElement('p');
    appendInline(paragraph, line);
    fragment.append(paragraph);
  }

  closeList();
  return fragment;
}

function appendInline(parent, text) {
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const node = document.createElement(match[1] ? 'strong' : 'em');
    node.textContent = match[1] ?? match[2];
    parent.append(node);
    lastIndex = pattern.lastIndex;
    match = pattern.exec(text);
  }
  if (lastIndex < text.length) parent.append(document.createTextNode(text.slice(lastIndex)));
}

export function card(title, ...children) {
  return el('section', { class: 'card' }, title ? el('h2', { text: title }) : null, ...children);
}

export function metric(label, value, hint, tone) {
  return el(
    'div',
    { class: `metric ${tone ? `metric-${tone}` : ''}` },
    el('span', { class: 'metric-label', text: label }),
    el('strong', { class: 'metric-value', text: value }),
    hint ? el('span', { class: 'metric-hint', text: hint }) : null,
  );
}

export function tag(text, tone = 'neutral') {
  return el('span', { class: `tag tag-${tone}`, text });
}
