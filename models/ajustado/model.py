import torch
import torch.nn as nn
import torch.nn.functional as F
import math


# ---------------------------------------------------------------------------
# Straight-Through Estimator (STE): cuantiza en forward, deja pasar el gradiente
# ---------------------------------------------------------------------------
class _STE(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x):
        return x.round()

    @staticmethod
    def backward(ctx, g):
        return g


def round_ste(x):
    return _STE.apply(x)


# ---------------------------------------------------------------------------
# BitLinear: pesos ternarios {-1, 0, 1} (absmean scaling) y activaciones int8
# ---------------------------------------------------------------------------
class BitLinear(nn.Linear):
    def __init__(self, in_features, out_features, bias=False, num_bits=8):
        super().__init__(in_features, out_features, bias=bias)
        self.q_b = 2 ** (num_bits - 1) - 1
        self.eps = 1e-5

    def forward(self, x):
        w = self.weight
        # Escala de pesos: media de |w| (estilo BitNet), sin gradiente
        with torch.no_grad():
            gamma = w.abs().mean().clamp(min=self.eps)
        w_scaled = w / gamma
        # clamp para garantizar cuantizacion ternaria estricta {-1, 0, 1}
        w_quant = round_ste(w_scaled.clamp(-1, 1))
        w_final = w_quant * gamma

        # Cuantizacion de activaciones: absmax por token
        eta = x.abs().amax(dim=-1, keepdim=True).detach().clamp(min=self.eps)
        x_scaled = (x * (self.q_b / eta)).clamp(-self.q_b, self.q_b)
        x_quant = round_ste(x_scaled)

        y = F.linear(x_quant, w_final, self.bias)
        return y * (eta / self.q_b)


# ---------------------------------------------------------------------------
# Bloque transformer con atencion causal
# ---------------------------------------------------------------------------
class Block(nn.Module):
    def __init__(self, n_embd, n_head, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(n_embd)
        self.attn = nn.MultiheadAttention(n_embd, n_head, batch_first=True)
        self.ln2 = nn.LayerNorm(n_embd)
        self.mlp = nn.Sequential(
            BitLinear(n_embd, 4 * n_embd),
            nn.GELU(),
            BitLinear(4 * n_embd, n_embd),
        )

    def forward(self, x, attn_mask=None):
        h = self.ln1(x)  # se calcula UNA sola vez
        attn_out, _ = self.attn(h, h, h, attn_mask=attn_mask, need_weights=False)
        x = x + attn_out
        x = x + self.mlp(self.ln2(x))
        return x


# ---------------------------------------------------------------------------
# Modelo completo
# ---------------------------------------------------------------------------
class MiniBitNet(nn.Module):
    def __init__(self, vocab_size=8192, n_embd=384, n_head=6, n_layer=6,
                 block_size=256, dropout=0.1, tie_weights=True):
        super().__init__()
        self.block_size = block_size
        self.n_layer = n_layer

        self.tok_emb = nn.Embedding(vocab_size, n_embd)
        self.pos_emb = nn.Embedding(block_size, n_embd)
        self.blocks = nn.ModuleList([Block(n_embd, n_head, dropout) for _ in range(n_layer)])
        self.ln_f = nn.LayerNorm(n_embd)
        self.lm_head = nn.Linear(n_embd, vocab_size)
        self.dropout = nn.Dropout(dropout)

        self.apply(self._init_weights)
        # Init escalado (GPT-2) para proyecciones de salida.
        # OJO: 'mlp.2.weight' (no '2.weight', que machacaba los LayerNorm ln2)
        for pn, p in self.named_parameters():
            if pn.endswith('out_proj.weight') or pn.endswith('mlp.2.weight'):
                torch.nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * n_layer))
            elif pn.endswith('lm_head.weight') and not tie_weights:
                torch.nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * n_layer))

        if tie_weights:
            self.lm_head.weight = self.tok_emb.weight

        # Mascara causal precalculada: True = posicion NO visible (futuro)
        mask = torch.triu(torch.ones(block_size, block_size, dtype=torch.bool), diagonal=1)
        self.register_buffer("causal_mask", mask, persistent=False)

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):  # cubre BitLinear tambien
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        tok = self.tok_emb(idx)
        pos = self.pos_emb(torch.arange(T, device=idx.device))
        x = self.dropout(tok + pos)

        mask = self.causal_mask[:T, :T]
        for block in self.blocks:
            x = block(x, attn_mask=mask)

        logits = self.lm_head(self.dropout(self.ln_f(x)))

        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, max_new_tokens=200, temperature=0.8, top_k=None):
        self.eval()
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -self.block_size:]
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :] / temperature
            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float("inf")
            probs = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, next_id), dim=1)
        return idx
