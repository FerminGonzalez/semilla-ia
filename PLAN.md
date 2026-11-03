# PLAN — Semilla-IA · MVP Nodo Neuro-Educativo

Pipeline: `orch-build-mvp` (ECC) · fase 0 → 6
Spec de entrada: `Pitch Hackaton_ Proyecto Semilla-IA.pdf`

## 0. Lectura del spec y decisiones bloqueadas

El pitch propone un nodo de hardware (SoC RISC-V, 1.58-bit, LoRa, solar, <12 USD)
que cubre 10 retos ProFuturo. El propio documento reconoce en su hoja de ruta que
la demo es una **simulación en hardware local**.

**Decisión de alcance (Gate 1).** Un hackathon no permite fabricar el SoC ni
entrenar un modelo ternario, y presentar cifras de hardware no medidas es el
camino más rápido a perder credibilidad ante un jurado técnico. Por tanto el MVP
separa con nitidez tres capas:

| Capa | Estado en el MVP | Cómo se demuestra |
|---|---|---|
| Inferencia local real | **Construida** | Ollama `qwen2.5:3b` en `127.0.0.1:11434`, sin salida a internet |
| Motor pedagógico determinista | **Construida** | Resuelve ejercicios, rúbricas y transcodificación en <10 ms |
| Nodo físico (RISC-V, LoRa, solar, BOM) | **Modelada y etiquetada** | Panel con medidas reales + proyecciones marcadas como tales |

Regla de honestidad aplicada a toda la interfaz: nada que no se haya medido se
presenta como medido. Las proyecciones llevan la etiqueta `proyección`.

## 1. Perfil del jurado → criterios de diseño

De las bases 2026: creatividad 40 % · acabado 20 % · transferibilidad 20 % ·
orientación a contextos vulnerables 20 %. Premio Retos ProFuturo: impacto 25 % ·
inclusión 25 % · sostenibilidad 25 % · ética 25 %.

Consecuencias:
- El producto tiene que **verse acabado**, no un cuaderno de laboratorio.
- La ética se demuestra con hechos en la interfaz, no con un párrafo.
- Todo lo que no exista debe estar etiquetado: el jurado premia la honestidad y
  castiga la sobreventa.

## 2. Slices verticales (cada una end-to-end y demostrable)

| # | Slice | Resultado visible | Criterio de aceptación |
|---|---|---|---|
| 1 | Nodo y estación | Panel con modelo, RAM, energía, red local y arranque | Carga en <1 s, sin dependencias externas, con métricas reales |
| 2 | Aula conversacional | Chat del alumno con 5 cartuchos y streaming | Responde sin internet; si matas Ollama, sigue respondiendo |
| 3 | Transcodificador (Reto 03) | Una lección en lectura fácil, audio y mapa conceptual | Tres formatos coherentes desde una sola fuente |
| 4 | Taller de ejercicios | Ejercicios con corrección y pista | Corrección determinista, sin modelo |
| 5 | Copiloto docente (Reto 12) | Dudas agregadas → dinámica del día siguiente + rúbrica | Panel protegido por PIN, datos solo locales |
| 6 | Laboratorio sin laboratorio (Reto 17) | Sensor entra → la IA razona sobre el dato real | Ingesta JSON/serial + serie simulada si no hay sensor |
| 7 | Federación y energía (Retos 13, 15) | Paquete LoRa anonimizado + consumo medido/proyectado | Sin PII en el paquete; cifras separadas por origen |
| 8 | Ética verificable | Página con límites y guion de comprobación offline | Cualquiera puede repetir la prueba sin servidor |

## 3. Arquitectura

```
navegador (alumno / docente)  ──LAN──┐
                                     ▼
                        server.mjs (Node stdlib, sin dependencias)
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
            orquestador (router)              almacén JSON local
        ┌───────────┴───────────┐
        ▼                       ▼
motor simbólico          ollama.mjs (qwen2.5:3b)
(<10 ms, determinista)   (~4,5 tok/s medidos)
```

**Por qué el orquestador es la pieza clave.** En un nodo de 1,2 W no se puede
gastar el modelo en todo. Medido en este equipo: una respuesta del modelo tarda
~30 s; un ejercicio corregido por el motor simbólico, <10 ms. El orquestador
manda al modelo solo lo que exige lenguaje natural (conversación, explicación,
traducción cultural) y resuelve localmente lo estructurado (ejercicios,
rúbricas, mapas, agregación). Eso es lo que hace creíble el objetivo de consumo.

## 4. Plan de calidad (gates)

- Gate 1: este documento (alcance y slices).
- Gate 2: antes de cada commit.
- Tests con `node --test` (sin dependencias): motor simbólico, transcodificador,
  orquestador, telemetría, API HTTP.
- Revisión: `code-reviewer` + `security-reviewer` de ECC sobre el resultado.
- Accesibilidad: contraste AA, foco visible, teclado, `prefers-reduced-motion`,
  etiquetas ARIA y `aria-live` en el chat.

## 5. Entregables

1. Prototipo ejecutable en esta carpeta (`npm start`).
2. `docs/INFORME-SEMILLA-IA.pdf` con evaluación, arquitectura, medidas reales,
   límites y guion de demo.
3. Repositorio git con commits `feat:` por slice.

## 6. Fuera de alcance (declarado, no oculto)

- Fabricación del nodo RISC-V y del cartucho LoRa.
- Entrenamiento o ajuste fino real de LoRA: los cartuchos son prompts de sistema
  y enrutado, exactamente como plantea la fase 3 del pitch.
- Cuantización ternaria: se explica y se proyecta, no se ejecuta.
- TTS neuronal: se usa la voz del sistema operativo del dispositivo.

