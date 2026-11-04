#!/usr/bin/env python3
"""Sidecar BitNet 17M con API compatible Ollama.

Solo usa la libreria estandar de Python para HTTP. El modelo se carga una vez
al arrancar y se sirve en el puerto 11435. En este MVP el unico modelo
anunciado es bitnet-17m:ternario; las peticiones explicitas a otros modelos
se siguen proxificando a Ollama real en 127.0.0.1:11434 cuando este disponible.
"""

from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------------------------------------------
# Configuracion desde el entorno
# ---------------------------------------------------------------------------
def _resolve_bitnet_dir() -> str:
    """Busca el motor en este orden:
    1. BITNET_DIR (variable de entorno)
    2. <repo>/models (portable: un clon limpio solo necesita el checkpoint)

    Sin rutas absolutas personales en el repositorio: si no esta el checkpoint,
    se dice que falta y donde ponerlo.
    """
    env = os.environ.get("BITNET_DIR")
    if env:
        return env
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local = os.path.join(here, "models")
    if os.path.isfile(os.path.join(local, "ckpt_4500.pt")):
        return local
    raise SystemExit(
        "[bitnet] ERROR: no se encontro ckpt_4500.pt (195 MB, fuera de git).\n"
        "[bitnet] Copialo a models/ (ver models/README.md) o define la variable\n"
        "[bitnet] de entorno BITNET_DIR con la carpeta que contiene el motor."
    )


BITNET_DIR = _resolve_bitnet_dir()
BITNET_THREADS = int(os.environ.get("BITNET_THREADS", "4"))
BITNET_PORT = int(os.environ.get("BITNET_PORT", "11435"))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")

MODEL_NAME = "bitnet-17m:ternario"
MAX_BODY_BYTES = 8 * 1024 * 1024

# ---------------------------------------------------------------------------
# Preparar importacion del motor BitNet
# ---------------------------------------------------------------------------
BITNET_DIR = os.path.abspath(BITNET_DIR)
if not os.path.isdir(BITNET_DIR):
    raise SystemExit(
        f"[bitnet] ERROR: no existe el directorio del motor: {BITNET_DIR}\n"
        f"[bitnet] Define la ruta correcta con la variable de entorno BITNET_DIR."
    )

sys.path.insert(0, BITNET_DIR)
os.chdir(BITNET_DIR)

import torch  # noqa: E402

torch.set_num_threads(BITNET_THREADS)
torch.set_num_interop_threads(min(BITNET_THREADS, 4))

from tokenizers import Tokenizer  # noqa: E402
from model import MiniBitNet  # noqa: E402

# ---------------------------------------------------------------------------
# Carga unica del modelo
# ---------------------------------------------------------------------------
print(f"[bitnet] cargando modelo desde {BITNET_DIR}", flush=True)
_start_load = time.perf_counter()

CKPT_PATH = os.path.join(BITNET_DIR, "ckpt_4500.pt")
TOKENIZER_PATH = os.path.join(BITNET_DIR, "tokenizer_wiki_8192.json")

try:
    ckpt = torch.load(CKPT_PATH, map_location="cpu", weights_only=True)
except Exception as exc:
    print(f"[bitnet] aviso: weights_only=True fallo ({exc}); reintentando con weights_only=False", flush=True)
    ckpt = torch.load(CKPT_PATH, map_location="cpu", weights_only=False)

CONFIG = ckpt["config"]
model = MiniBitNet(**CONFIG)
model.load_state_dict(ckpt["model"])
model.eval()

# Liberar el dict del checkpoint; el modelo ya esta cargado.
del ckpt

PARAM_COUNT = sum(p.numel() for p in model.parameters())
MODEL_SIZE_BYTES = os.path.getsize(CKPT_PATH)
LOADED_RAM_BYTES = PARAM_COUNT * 4  # float32

# Solo una inferencia a la vez para no saturar CPU.
INFERENCE_LOCK = threading.Semaphore(1)

tokenizer = Tokenizer.from_file(TOKENIZER_PATH)

_load_s = time.perf_counter() - _start_load
print(
    f"[bitnet] modelo listo: {PARAM_COUNT:,} params, "
    f"checkpoint {MODEL_SIZE_BYTES / (1024 * 1024):.1f} MB "
    f"({_load_s:.1f} s)",
    flush=True,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def ollama_model_entry() -> dict:
    return {
        "name": MODEL_NAME,
        "model": MODEL_NAME,
        "size": MODEL_SIZE_BYTES,
        "modified_at": "2026-11-03T15:30:00-05:00",
        "digest": "bitnet-17m-ternario",
        "details": {
            "format": "bitnet",
            "family": "bitnet",
            "parameter_size": "17M",
            "quantization_level": "TERNARY",
        },
    }


def build_prompt(messages: list[dict]) -> str:
    """Concatena system + user en texto plano; ignora roles asistente/otros."""
    parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role in ("system", "user") and content:
            parts.append(content)
    return " ".join(parts)


def generate_tokens(prompt: str, max_new_tokens: int, temperature: float):
    """Generador que produce (fragmento_texto, es_final, done_reason).

    El done_reason puede ser 'stop' (EOS o doble salto de linea) o 'length'
    (tope de tokens).
    """
    input_ids = tokenizer.encode(prompt).ids
    max_context = max(1, CONFIG["block_size"] - max_new_tokens)
    if len(input_ids) > max_context:
        input_ids = input_ids[-max_context:]

    generated_ids = list(input_ids)
    last_decoded = tokenizer.decode(input_ids)
    eos_id = 2  # </s>

    with torch.inference_mode():
        for step in range(max_new_tokens):
            idx = torch.tensor([generated_ids[-CONFIG["block_size"] :]], dtype=torch.long)
            logits, _ = model(idx)
            logits = logits[:, -1, :] / max(temperature, 1e-6)
            probs = torch.softmax(logits, dim=-1)
            next_id_t = torch.multinomial(probs, num_samples=1)
            next_id = int(next_id_t.item())

            generated_ids.append(next_id)

            full_text = tokenizer.decode(generated_ids)
            delta = full_text[len(last_decoded) :]
            last_decoded = full_text

            is_final = next_id == eos_id
            done_reason = "stop"

            # Cortar en doble salto de linea tras ~15 tokens para evitar divagaciones.
            if step >= 15 and "\n\n" in full_text:
                yield delta, True, "stop"
                break

            if next_id == eos_id:
                yield delta, True, "stop"
                break

            # Si el token actual dejo un punto de codigo incompleto, no lo emitimos
            # todavia; el siguiente token completara el carácter.
            if full_text.endswith("\ufffd"):
                continue

            if step == max_new_tokens - 1:
                done_reason = "length"
                is_final = True

            yield delta, is_final, done_reason


# ---------------------------------------------------------------------------
# Manejador HTTP
# ---------------------------------------------------------------------------
class BitNetHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        self._headers_sent = False
        super().__init__(*args, **kwargs)

    def log_message(self, fmt: str, *args):
        print(f"[bitnet] {self.address_string()} - {fmt % args}", flush=True)

    def handle(self):
        try:
            super().handle()
        except ConnectionError:
            pass

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.close_connection = True
        self.end_headers()
        self._headers_sent = True
        self.wfile.write(body)

    def _send_error(self, status: int, message: str):
        if self._headers_sent:
            self.close_connection = True
            return
        self._send_json(status, {"error": message})

    def _read_body(self) -> bytes:
        length_hdr = self.headers.get("Content-Length")
        if length_hdr is None:
            return b""
        try:
            length = int(length_hdr)
        except ValueError:
            raise ValueError("Content-Length invalido")
        if length < 0:
            raise ValueError("Content-Length negativo")
        if length > MAX_BODY_BYTES:
            raise ValueError(f"cuerpo demasiado grande: {length} bytes")
        return self.rfile.read(length) if length > 0 else b""

    def _proxy_to_ollama(self, body: bytes = b""):
        """Reenvia POST a Ollama real manteniendo el body y el streaming intactos."""
        path = self.path
        if not body:
            body = self._read_body()

        headers = {
            "Content-Type": self.headers.get("Content-Type", "application/json"),
            "Content-Length": str(len(body)),
            "Accept": self.headers.get("Accept", "*/*"),
        }

        try:
            req = urllib.request.Request(
                OLLAMA_URL + path, data=body, headers=headers, method="POST"
            )
            with urllib.request.urlopen(req, timeout=300) as upstream:
                self.send_response(upstream.status)
                self.send_header("Connection", "close")
                self.close_connection = True
                self._headers_sent = True
                hop_by_hop = {
                    "transfer-encoding",
                    "content-length",
                    "connection",
                    "date",
                    "server",
                    "keep-alive",
                }
                for key, value in upstream.headers.items():
                    if key.lower() not in hop_by_hop:
                        self.send_header(key, value)
                self.end_headers()

                while True:
                    chunk = upstream.read1(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except urllib.error.HTTPError as exc:
            body_err = exc.read()
            self.send_response(exc.code)
            self.send_header("Connection", "close")
            self.close_connection = True
            self._headers_sent = True
            for key, value in exc.headers.items():
                if key.lower() not in {"transfer-encoding", "content-length", "connection"}:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(body_err)))
            self.end_headers()
            self.wfile.write(body_err)
        except Exception as exc:
            self._send_error(502, f"proxy Ollama fallo: {exc}")

    def do_GET(self):
        try:
            if self.path == "/api/tags":
                # MVP: solo se anuncia el motor propio.
                self._send_json(200, {"models": [ollama_model_entry()]})
            elif self.path == "/api/ps":
                # MVP: solo se reporta el motor propio cargado en RAM.
                self._send_json(
                    200,
                    {
                        "models": [
                            {
                                "name": MODEL_NAME,
                                "model": MODEL_NAME,
                                "size": LOADED_RAM_BYTES,
                            }
                        ]
                    },
                )
            else:
                self._send_error(404, "ruta no encontrada")
        except ConnectionError:
            pass
        except Exception as exc:
            try:
                self._send_error(500, str(exc))
            except ConnectionError:
                pass

    def do_POST(self):
        try:
            if self.path not in ("/api/chat", "/api/generate"):
                self._send_error(404, "ruta no encontrada")
                return

            body_bytes = self._read_body()

            if self.path == "/api/generate":
                self._handle_generate(body_bytes)
                return

            try:
                body = json.loads(body_bytes.decode("utf-8"))
            except Exception as exc:
                self._send_error(400, f"JSON invalido: {exc}")
                return

            if not isinstance(body, dict):
                self._send_error(400, "el cuerpo debe ser un objeto JSON")
                return

            options = body.get("options") or {}
            if not isinstance(options, dict):
                self._send_error(400, "options debe ser un objeto")
                return

            requested_model = body.get("model", "")

            if not requested_model.startswith("bitnet"):
                self._proxy_to_ollama(body_bytes)
                return

            self._handle_chat(body)
        except ConnectionError:
            pass
        except Exception as exc:
            try:
                self._send_error(500, str(exc))
            except ConnectionError:
                pass

    def _handle_generate(self, body_bytes: bytes):
        """POST /api/generate."""
        try:
            body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception as exc:
            self._send_error(400, f"JSON invalido: {exc}")
            return

        requested_model = body.get("model", "")
        if not requested_model.startswith("bitnet"):
            self._proxy_to_ollama(body_bytes)
            return

        # Precalentar el modelo propio: basta con responder 200 inmediatamente.
        self._send_json(
            200,
            {
                "model": MODEL_NAME,
                "created_at": now_iso(),
                "response": "",
                "done": True,
            },
        )

    def _handle_chat(self, body: dict):
        messages = body.get("messages", [])
        if not isinstance(messages, list):
            self._send_error(400, "messages debe ser una lista")
            return

        stream = body.get("stream", True)
        options = body.get("options") or {}

        try:
            temperature = float(options.get("temperature", 0.7))
            max_new = int(options.get("num_predict", 120))
        except (TypeError, ValueError) as exc:
            self._send_error(400, f"opcion numerica invalida: {exc}")
            return

        max_new = max(1, min(max_new, 120))  # tope duro de 120

        prompt = build_prompt(messages)
        if not prompt:
            self._send_error(400, "prompt vacio")
            return

        if stream:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.close_connection = True
            self.end_headers()
            self._headers_sent = True

            generated_count = 0
            start_ns = None
            failed = False
            client_gone = False
            done_reason = "stop"

            try:
                with INFERENCE_LOCK:
                    for delta, is_final, reason in generate_tokens(
                        prompt, max_new, temperature
                    ):
                        if start_ns is None:
                            start_ns = time.perf_counter_ns()

                        if delta:
                            generated_count += 1
                            chunk = {
                                "model": MODEL_NAME,
                                "created_at": now_iso(),
                                "message": {"role": "assistant", "content": delta},
                                "done": False,
                            }
                            line = json.dumps(chunk, ensure_ascii=False) + "\n"
                            try:
                                self.wfile.write(line.encode("utf-8"))
                                self.wfile.flush()
                            except ConnectionError:
                                client_gone = True
                                break

                        if is_final:
                            done_reason = reason
                            break
            except Exception:
                failed = True
                try:
                    err_line = json.dumps(
                        {"error": "error interno de generacion"}, ensure_ascii=False
                    ) + "\n"
                    self.wfile.write(err_line.encode("utf-8"))
                    self.wfile.flush()
                except ConnectionError:
                    pass

            if not failed and not client_gone and start_ns is not None:
                eval_duration = time.perf_counter_ns() - start_ns
                final = {
                    "model": MODEL_NAME,
                    "created_at": now_iso(),
                    "message": {"role": "assistant", "content": ""},
                    "done": True,
                    "done_reason": done_reason,
                    "eval_count": generated_count,
                    "eval_duration": eval_duration,
                }
                line = json.dumps(final, ensure_ascii=False) + "\n"
                try:
                    self.wfile.write(line.encode("utf-8"))
                    self.wfile.flush()
                except ConnectionError:
                    pass
        else:
            pieces = []
            done_reason = "stop"
            start_ns = None
            try:
                with INFERENCE_LOCK:
                    for delta, is_final, reason in generate_tokens(
                        prompt, max_new, temperature
                    ):
                        if start_ns is None:
                            start_ns = time.perf_counter_ns()
                        if delta:
                            pieces.append(delta)
                        if is_final:
                            done_reason = reason
                            break
            except Exception as exc:
                self._send_error(500, f"error de generacion: {exc}")
                return

            eval_duration = time.perf_counter_ns() - start_ns if start_ns else 0
            generated_count = sum(1 for p in pieces if p)

            self._send_json(
                200,
                {
                    "model": MODEL_NAME,
                    "created_at": now_iso(),
                    "message": {
                        "role": "assistant",
                        "content": "".join(pieces),
                    },
                    "done": True,
                    "done_reason": done_reason,
                    "eval_count": generated_count,
                    "eval_duration": eval_duration,
                },
            )


def find_free_port(host: str, port: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return port
        except OSError:
            return 0


def main():
    host = "127.0.0.1"
    port = find_free_port(host, BITNET_PORT)
    if port == 0:
        port = BITNET_PORT
        print(f"[bitnet] advertencia: puerto {port} parece ocupado, intentando igual", flush=True)

    server = ThreadingHTTPServer((host, port), BitNetHandler)
    server.block_on_close = False
    print(f"[bitnet] escuchando en http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("[bitnet] servidor detenido", flush=True)


if __name__ == "__main__":
    main()
