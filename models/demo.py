import torch
from tokenizers import Tokenizer
from model import MiniBitNet
import gradio as gr

print("Cargando modelo de Wikipedia...")
tokenizer = Tokenizer.from_file("tokenizer_wiki_8192.json")
device = "cpu" # Usamos CPU

# Asegúrate de que el nombre coincida con el archivo que descargaste
ckpt = torch.load("ckpt_4500.pt", map_location=device) 
model = MiniBitNet(**ckpt["config"]).to(device)
model.load_state_dict(ckpt["model"])
model.eval()

def generar_texto(prompt, max_tokens, temperatura):
    input_ids = torch.tensor([tokenizer.encode(prompt).ids], device=device)
    with torch.no_grad():
        out = model.generate(input_ids, max_new_tokens=max_tokens, temperature=temperatura)
    return tokenizer.decode(out[0].tolist())

interfaz = gr.Interface(
    fn=generar_texto,
    inputs=[
        gr.Textbox(label="Escribe el inicio del artículo", value="La historia de España se remonta a"),
        gr.Slider(minimum=20, maximum=300, value=150, step=10, label="Longitud del texto"),
        gr.Slider(minimum=0.1, maximum=1.5, value=0.7, step=0.1, label="Temperatura")
    ],
    outputs=gr.Textbox(label="Texto Generado", lines=10),
    title="BitNet 17M - Wikipedia en Español",
    description="Modelo ternario de 17M de parámetros entrenado con artículos de Wikipedia. 100% offline."
)

interfaz.launch()