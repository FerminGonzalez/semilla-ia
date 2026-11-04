import os, time, math, sys, random
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from torch.amp import autocast, GradScaler
from torch.nn.utils import clip_grad_norm_
sys.path.append('/kaggle/working')
from model import MiniBitNet

DATA_DIR        = "/kaggle/temp"
CHECKPOINT_DIR  = "/kaggle/working/checkpoints_wiki_v2"
BATCH_SIZE      = 64
BLOCK_SIZE      = 256
GRAD_ACCUM      = 2
LR              = 3e-4
MAX_ITERS       = 20000
WARMUP_ITERS    = 500
EVAL_INTERVAL   = 500
CKPT_INTERVAL   = 1000
DEVICE          = "cuda" if torch.cuda.is_available() else "cpu"
os.makedirs(CHECKPOINT_DIR, exist_ok=True)

# CORRECCIÓN: aceleraciones para GPU en Kaggle
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True
torch.backends.cudnn.benchmark = True

class TokenDataset(Dataset):
    def __init__(self, bin_path, block_size):
        self.data = np.memmap(bin_path, dtype=np.uint16, mode="r")
        self.block_size = block_size
    def __len__(self):
        return len(self.data) - self.block_size - 1
    def __getitem__(self, i):
        x = torch.from_numpy(self.data[i:i+self.block_size].astype(np.int64))
        y = torch.from_numpy(self.data[i+1:i+1+self.block_size].astype(np.int64))
        return x, y

train_ds = TokenDataset(os.path.join(DATA_DIR, "train_wiki.bin"), BLOCK_SIZE)
val_ds   = TokenDataset(os.path.join(DATA_DIR, "val_wiki.bin"),   BLOCK_SIZE)
train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=2, pin_memory=True, drop_last=True)
val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=2, pin_memory=True)

config = dict(vocab_size=8192, n_embd=384, n_head=6, n_layer=6, block_size=BLOCK_SIZE)
model = MiniBitNet(**config).to(DEVICE)
print(f"🚀 Parámetros del modelo: {sum(p.numel() for p in model.parameters())/1e6:.2f}M")

# CORRECCIÓN: weight decay solo en parámetros >= 2D (matrices/embeddings),
# no en LayerNorms ni biases
decay_params    = [p for p in model.parameters() if p.dim() >= 2]
no_decay_params = [p for p in model.parameters() if p.dim() < 2]
print(f"   decay: {sum(p.numel() for p in decay_params)/1e6:.2f}M | no_decay: {sum(p.numel() for p in no_decay_params)/1e6:.2f}M")
optimizer = torch.optim.AdamW([
    {"params": decay_params,    "weight_decay": 0.5},
    {"params": no_decay_params, "weight_decay": 0.0},
], lr=LR, betas=(0.9, 0.95))
scaler = GradScaler(device=DEVICE, enabled=(DEVICE == "cuda"))

def get_lr(it):
    if it < WARMUP_ITERS: return LR * (it + 1) / (WARMUP_ITERS + 1)
    decay_ratio = (it - WARMUP_ITERS) / (MAX_ITERS - WARMUP_ITERS)
    return LR * (0.5 * (1.0 + math.cos(math.pi * decay_ratio)))

start_iter = 0
ckpts = sorted([f for f in os.listdir(CHECKPOINT_DIR) if f.startswith("ckpt_")],
               key=lambda x: int(x.split("_")[1].split(".")[0]))
if ckpts:
    latest = os.path.join(CHECKPOINT_DIR, ckpts[-1])
    print(f"🔄 Reanudando desde {latest}")
    ckpt = torch.load(latest, map_location=DEVICE)
    model.load_state_dict(ckpt["model"])
    optimizer.load_state_dict(ckpt["optimizer"])
    if "scaler" in ckpt:                      # CORRECCIÓN: restaurar scaler
        scaler.load_state_dict(ckpt["scaler"])
    start_iter = ckpt["iter_num"] + 1

# CORRECCIÓN: eval sobre offsets aleatorios (muestreo del val set, no siempre los mismos)
@torch.no_grad()
def estimate_loss(n_eval=50):
    model.eval()
    losses = []
    for _ in range(n_eval):
        i = random.randint(0, len(val_ds) - 1)
        x, y = val_ds[i]
        x, y = x.unsqueeze(0).to(DEVICE), y.unsqueeze(0).to(DEVICE)  # batch de 1 por muestra
        with autocast(device_type=DEVICE, dtype=torch.float16):
            _, loss = model(x, y)
        losses.append(loss.item())
    model.train()
    return sum(losses) / len(losses)

# CORRECCIÓN: mantener solo los últimos 2 checkpoints
def save_checkpoint(state, keep=2):
    torch.save(state, os.path.join(CHECKPOINT_DIR, f"ckpt_{state['iter_num']+1}.pt"))
    ckpts = sorted([f for f in os.listdir(CHECKPOINT_DIR) if f.startswith("ckpt_")],
                   key=lambda x: int(x.split("_")[1].split(".")[0]))
    for old in ckpts[:-keep]:
        os.remove(os.path.join(CHECKPOINT_DIR, old))

model.train()
train_iter = iter(train_loader)
running_loss = 0.0
t0 = time.time()

print("🔥 Iniciando entrenamiento (Modelo 17M Corregido)...")
for it in range(start_iter, MAX_ITERS):
    lr = get_lr(it)
    for param_group in optimizer.param_groups:
        param_group["lr"] = lr

    optimizer.zero_grad(set_to_none=True)
    for _ in range(GRAD_ACCUM):
        try: x, y = next(train_iter)
        except StopIteration: train_iter = iter(train_loader); x, y = next(train_iter)
        x, y = x.to(DEVICE), y.to(DEVICE)

        with autocast(device_type=DEVICE, dtype=torch.float16):
            _, loss = model(x, y)
            loss = loss / GRAD_ACCUM

        scaler.scale(loss).backward()
        running_loss += loss.item() * GRAD_ACCUM

    scaler.unscale_(optimizer)
    clip_grad_norm_(model.parameters(), 1.0)
    scaler.step(optimizer)
    scaler.update()

    if (it + 1) % 100 == 0:
        print(f"iter {it+1:5d} | loss {running_loss/100:.4f} | lr {lr:.2e} | {time.time()-t0:.1f}s")
        running_loss = 0.0
        t0 = time.time()

    if (it + 1) % EVAL_INTERVAL == 0:
        print(f"🔎 val_loss {estimate_loss():.4f}")

    if (it + 1) % CKPT_INTERVAL == 0:
        save_checkpoint({"model": model.state_dict(), "optimizer": optimizer.state_dict(),
                         "scaler": scaler.state_dict(), "iter_num": it, "config": config})

print("🎉 Entrenamiento completado.")
