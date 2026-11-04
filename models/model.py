import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class _STE(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x):
        return x.round()
    @staticmethod
    def backward(ctx, g):
        return g

def round_ste(x):
    return _STE.apply(x)

class BitLinear(nn.Linear):
    def __init__(self, in_features, out_features, bias=False, num_bits=8):
        super().__init__(in_features, out_features, bias=bias)
        self.q_b = 2 ** (num_bits - 1) - 1
        self.eps = 1e-5

    def forward(self, x):
        w = self.weight
        with torch.no_grad():
            # Normalización por la media absoluta
            gamma = w.abs().mean().clamp(min=self.eps)

        # 1. Cuantización Ternaria Real {-1, 0, 1} con STE
        w_scaled = w / gamma
        # CORRECCIÓN: clip a {-1, 0, 1}; el gradiente pasa intacto gracias a round_ste
        w_quant = round_ste(w_scaled).clamp(-1, 1)
        w_final = w_quant * gamma

        # 2. Cuantización de Activaciones (8 bits)
        eta = x.abs().amax(dim=-1, keepdim=True).detach().clamp(min=self.eps)
        x_scaled = x * (self.q_b / eta)
        x_quant = round_ste(x_scaled)

        y = F.linear(x_quant, w_final, self.bias)
        return y * (eta / self.q_b)

class Block(nn.Module):
    def __init__(self, n_embd, n_head):
        super().__init__()
        self.ln1 = nn.LayerNorm(n_embd)
        self.attn = nn.MultiheadAttention(n_embd, n_head, batch_first=True)
        self.ln2 = nn.LayerNorm(n_embd)
        self.mlp = nn.Sequential(
            BitLinear(n_embd, 4 * n_embd),
            nn.GELU(),
            BitLinear(4 * n_embd, n_embd),
        )
    def forward(self, x):
        h = self.ln1(x)  # CORRECCIÓN: calcular una sola vez
        # CORRECCIÓN: máscara causal para LM autoregresivo (compatible con todas las versiones)
        T = x.size(1)
        mask = torch.triu(torch.full((T, T), float('-inf'), device=x.device), diagonal=1)
        attn_out, _ = self.attn(h, h, h, attn_mask=mask)
        x = x + attn_out
        x = x + self.mlp(self.ln2(x))
        return x

class MiniBitNet(nn.Module):
    def __init__(self, vocab_size=8192, n_embd=384, n_head=6, n_layer=6, block_size=256):
        super().__init__()
        self.block_size = block_size
        self.tok_emb = nn.Embedding(vocab_size, n_embd)
        self.pos_emb = nn.Embedding(block_size, n_embd)
        self.blocks = nn.Sequential(*[Block(n_embd, n_head) for _ in range(n_layer)])
        self.ln_f = nn.LayerNorm(n_embd)
        self.lm_head = nn.Linear(n_embd, vocab_size)

        self.dropout = nn.Dropout(0.1) 
        self.n_layer = n_layer 

        self.apply(self._init_weights)

        # GPT-2 Trick: estabilizar las proyecciones de salida
        for pn, p in self.named_parameters():
            if pn.endswith('out_proj.weight') or pn.endswith('2.weight') or pn.endswith('lm_head.weight'):
                torch.nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * self.n_layer))

    def _init_weights(self, module):
        if isinstance(module, nn.Linear) or isinstance(module, BitLinear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        tok = self.tok_emb(idx)
        pos = self.pos_emb(torch.arange(T, device=idx.device))
        x = self.blocks(tok + pos)
        x = self.ln_f(x)
        x = self.dropout(x)
        logits = self.lm_head(x)

        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, max_new_tokens=200, temperature=0.8):
        self.eval()  # CORRECCIÓN: desactivar dropout durante la generación
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -self.block_size:]
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :] / temperature
            probs = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, next_id), dim=1)
        return idx
