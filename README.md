# Semilla-IA · Nodo neuro-educativo autónomo

Prototipo para **#hack4edu 2026 · Reto 02 — Aprender sin conexión**.

Un nodo que sirve un aula completa por red local, conversa con un modelo de lenguaje
ejecutado en la propia máquina, corrige ejercicios sin red y entrega al docente un
resumen de lo que la clase no entendió. **Sin internet en ningún paso.**

> La IA prepara y acompaña. El docente decide. El alumno no habla con cualquiera:
> habla con un cartucho que tiene reglas.

## Arranque

```bash
cd C:\Users\Ghost\hac4edu2
node src/server.mjs
```

- Panel: <http://127.0.0.1:8090>
- **No requiere `npm install`**: usa solo la librería estándar de Node 24.
- El PIN del panel docente se imprime en el primer arranque (también queda en `data/config.json`).

Para publicar el aula en la red local:

```powershell
$env:NODO_HOST = '0.0.0.0'
node src/server.mjs
```

## Qué hay dentro

| Pieza | Estado | Nota |
|---|---|---|
| Servidor de aula (Node estándar) | Funcional | Streaming SSE, sesión HMAC, CSP |
| Inferencia local (Ollama + qwen2.5:3b) | Funcional | 5,7 tok/s medidos en este equipo |
| Orquestador simbólico/modelo | Funcional | Decide por tarea y lo declara |
| 5 cartuchos pedagógicos | Funcional | Matemáticas, ciencias, lengua, lenguas originarias, calma |
| Transcodificador (Reto 03) | Funcional | Lectura fácil, audio y mapa en ~8 ms |
| Taller y corrección sin estado | Funcional | Generación por semilla |
| Copiloto docente (Reto 12) | Funcional | Dudas agregadas, dinámica, rúbrica, señales |
| Sensor y método científico (Reto 17) | Funcional | Ingesta HTTP + andamiaje |
| Telemetría federada (Reto 13) | Funcional | 17 B binarios, cabe en un marco LoRa |
| Nodo RISC-V, LoRa, solar | **Proyección** | Modelado, no ejecutado |
| LoRA entrenado | **Fuera de alcance** | Los cartuchos son prompts + reglas |

El informe completo, con la evaluación del pitch y las medidas, está en
[`docs/INFORME-SEMILLA-IA.pdf`](docs/INFORME-SEMILLA-IA.pdf).

## El orquestador, en una frase

En este equipo el modelo tarda 42 segundos por respuesta y el motor simbólico
resuelve en menos de 10 milisegundos. Mandarle todo al modelo haría el aula
inusable; por eso el orquestador solo le envía lenguaje natural y descarga lo
estructurado (aritmética, ejercicios, rúbricas, mapas, agregados).

Cada respuesta indica en la interfaz qué motor la produjo y cuánto tardó.

## Los cinco cartuchos

| Cartucho | Reto | Qué cambia |
|---|---|---|
| Sin prisa | 10 | Tutoría con material manipulable, sin cronómetro ni etiquetas |
| Con las manos | 17 | Método científico con datos reales del sensor |
| Palabra a palabra | 03 | Lectoescritura y lectura fácil |
| Dos mundos | 06 | Puente castellano ↔ quechua/guaraní, con léxico verificado |
| Cápsula de calma | 15 | Acompañamiento en emergencias con derivación a un adulto |

El cartucho de lenguas **no inventa**: si se le pide ngäbere, responde que no tiene
léxico verificado y propone cómo construirlo con un hablante nativo.

## API

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/profile` | GET | Hardware, modelo, medidas y proyecciones |
| `/api/chat` | POST | Conversación con streaming SSE y motor declarado |
| `/api/transcode` | POST | Una lección en tres formatos |
| `/api/exercise` | POST | Serie determinista de ejercicios |
| `/api/exercise/check` | POST | Corrección sin estado |
| `/api/teacher/login` | POST | PIN → cookie firmada (8 h) |
| `/api/teacher/summary` | GET | Dudas, dinámica, rúbrica y señales |
| `/api/sensors` | GET / POST | Lecturas del sensor |
| `/api/telemetry` | GET | Paquete federado y balance energético |
| `/api/telemetry/send` | POST | Genera y guarda un paquete |

## Pruebas

```bash
npm test        # node --test "tests/*.test.mjs"  → 44 pruebas
```

Cubren el transcodificador, la generación y corrección de ejercicios, el
orquestador, los cartuchos, la agregación docente, el sensor y el paquete de
telemetría.

## Configuración

| Variable | Por defecto | Para qué |
|---|---|---|
| `NODO_PORT` | `8090` | Puerto. **No** se usa `PORT` a propósito. |
| `NODO_HOST` | `127.0.0.1` | `0.0.0.0` publica el aula en la red local |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Servicio de inferencia |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Modelo local |

Si Ollama no está en marcha, el nodo arranca igual y responde con el motor
simbólico, declarándolo en cada respuesta.

## Seguridad y datos

- El servidor no realiza peticiones salientes salvo al modelo local.
- Panel docente con PIN generado en el arranque, cookie `HttpOnly` + `SameSite=Strict`
  y firma HMAC con caducidad de 8 horas.
- CSP sin `unsafe-inline` para scripts; límite de tamaño de cuerpo; rutas estáticas
  confinadas al directorio web.
- No se guardan nombres de alumnos, IP ni historial de conversación: solo la pregunta
  anonimizada, el cartucho y el curso.
- Las imágenes y el texto libre nunca se marcan como incorrectos.

## Estructura

```
src/server.mjs     servidor, rutas, sesión
src/core/*.mjs     orquestador, motor simbólico, transcodificador,
                   ejercicios, docente, sensores, telemetría
src/web/           interfaz sin compilación (módulos ES + CSS)
tests/             44 pruebas nativas
docs/              informe en PDF y capturas
```

## Licencia

Prototipo educativo para #hack4edu 2026. Código abierto; el informe y las capturas
se comparten con la misma licencia que exigen las bases del certamen.

