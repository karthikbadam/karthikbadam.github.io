#!/usr/bin/env python3
"""
Capture live activations from SmolLM3-3B for visualization.

Uses chat template with enable_thinking=False to disable reasoning mode.
Only tokens from the model's response are captured (prompt tokens are skipped).
"""

import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import time
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer, AutoConfig

OUTPUT_DIR = Path("public/data/llm")
MODEL_ID = "HuggingFaceTB/SmolLM3-3B"

PROMPTS = [
    "What is the black hole information paradox? Answer in 1 sentence.",
    "Explain quantum entanglement in simple terms. Answer in 1 sentence.",
    "Compute 587 + 678 = Answer with just the number.",
    "Write a one-line Python lambda for factorial.",
    "In what year did World War II end? Answer with just the year."
]

NUM_LAYERS = NUM_HEADS = NUM_KV_HEADS = HIDDEN_SIZE = INTERMEDIATE_SIZE = HEAD_DIM = None
RESPONSE_START_POSITION = 0  # Set dynamically per prompt to capture only response tokens
SAVE_ATTENTION_SCORES = True

captured_activations = {
    "hidden_states": [], "attention_patterns": [], "attention_scores": [],
    "qkv_activations": [], "mlp_activations": [], "layer_norms": [], "tokens": [],
}
final_layer_hidden_states = None
_qkv_cache = {}

def initialize_config(config_dict):
    global NUM_LAYERS, NUM_HEADS, NUM_KV_HEADS, HIDDEN_SIZE, INTERMEDIATE_SIZE, HEAD_DIM
    NUM_LAYERS = config_dict["num_hidden_layers"]
    NUM_HEADS = config_dict["num_attention_heads"]
    NUM_KV_HEADS = config_dict["num_key_value_heads"]
    HIDDEN_SIZE = config_dict["hidden_size"]
    INTERMEDIATE_SIZE = config_dict["intermediate_size"]
    HEAD_DIM = HIDDEN_SIZE // NUM_HEADS

def should_capture_position(pos): return pos >= RESPONSE_START_POSITION
def get_adjusted_position(pos): return pos - RESPONSE_START_POSITION

def capture_hidden_state_hook(layer_idx, prompt_id, prompt_text):
    def hook(module, input, output):
        try:
            hidden = output[0] if isinstance(output, tuple) else output
            if hidden is None or hidden.dim() != 3: return
            for pos in range(hidden.shape[1]):
                if not should_capture_position(pos): continue
                captured_activations["hidden_states"].append({
                    "prompt_id": prompt_id, "prompt_text": prompt_text, "layer": layer_idx,
                    "position": get_adjusted_position(pos), "abs_position": pos,
                    "values": hidden[0, pos, :].detach().cpu().float().numpy().tolist(),
                })
        except Exception as e: print(f"  Warning: hidden state hook error layer {layer_idx}: {e}")
    return hook

def capture_q_proj_hook(layer_idx):
    def hook(module, input, output):
        if output is not None and output.dim() == 3:
            _qkv_cache.setdefault(layer_idx, {})["q"] = output.detach().cpu().float()
    return hook

def capture_k_proj_hook(layer_idx):
    def hook(module, input, output):
        if output is not None and output.dim() == 3:
            _qkv_cache.setdefault(layer_idx, {})["k"] = output.detach().cpu().float()
    return hook

def capture_v_proj_hook(layer_idx):
    def hook(module, input, output):
        if output is not None and output.dim() == 3:
            _qkv_cache.setdefault(layer_idx, {})["v"] = output.detach().cpu().float()
    return hook

def process_qkv_scores(layer_idx, prompt_id, prompt_text):
    if layer_idx not in _qkv_cache or "q" not in _qkv_cache[layer_idx]: return
    q, k = _qkv_cache[layer_idx]["q"], _qkv_cache[layer_idx]["k"]
    v = _qkv_cache[layer_idx].get("v")
    batch_size, seq_len, _ = q.shape
    q = q.view(batch_size, seq_len, NUM_HEADS, HEAD_DIM).transpose(1, 2)
    k = k.view(batch_size, seq_len, NUM_KV_HEADS, HEAD_DIM).transpose(1, 2)
    if v is not None: v = v.view(batch_size, seq_len, NUM_KV_HEADS, HEAD_DIM).transpose(1, 2)
    if NUM_HEADS > NUM_KV_HEADS:
        k = k.repeat_interleave(NUM_HEADS // NUM_KV_HEADS, dim=1)
        if v is not None: v = v.repeat_interleave(NUM_HEADS // NUM_KV_HEADS, dim=1)
    scores_np = (torch.matmul(q, k.transpose(-2, -1)) / np.sqrt(HEAD_DIM))[0].numpy()
    
    if SAVE_ATTENTION_SCORES:
        valid_pos = [p for p in range(seq_len) if should_capture_position(p)]
        rows = [{"prompt_id": np.int16(prompt_id), "prompt_text": prompt_text,
                 "layer": np.int16(layer_idx), "head": np.int16(h),
                 "query_pos": np.int32(get_adjusted_position(qp)),
                 "key_pos": np.int32(get_adjusted_position(kp)),
                 "score": np.float32(scores_np[h, qp, kp])}
                for h in range(NUM_HEADS) for qp in valid_pos for kp in valid_pos]
        if rows:
            captured_activations.setdefault("attention_scores_dfs", []).append(pd.DataFrame(rows))
            captured_activations["attention_scores"].extend(rows)
    
    for pos in range(seq_len):
        if not should_capture_position(pos): continue
        for head in range(NUM_HEADS):
            captured_activations["qkv_activations"].append({
                "prompt_id": prompt_id, "prompt_text": prompt_text,
                "layer": layer_idx, "head": head, "position": get_adjusted_position(pos),
                "abs_position": pos,
                "q_values": q[0, head, pos, :].numpy().tolist(),
                "k_values": k[0, head, pos, :].numpy().tolist(),
                "v_values": (v[0, head, pos, :].numpy() if v is not None else np.zeros(HEAD_DIM)).tolist(),
            })
    del _qkv_cache[layer_idx]

def capture_mlp_hook(layer_idx, stage, prompt_id, prompt_text):
    def hook(module, input, output):
        try:
            activation = output[0] if isinstance(output, tuple) else output
            if activation is None or activation.dim() != 3: return
            for pos in range(activation.shape[1]):
                if not should_capture_position(pos): continue
                captured_activations["mlp_activations"].append({
                    "prompt_id": prompt_id, "prompt_text": prompt_text,
                    "layer": layer_idx, "position": get_adjusted_position(pos),
                    "abs_position": pos, "stage": stage,
                    "values": activation[0, pos, :].detach().cpu().float().numpy().tolist(),
                })
        except Exception as e: print(f"  Warning: MLP hook error layer {layer_idx}, stage {stage}: {e}")
    return hook

def capture_layer_norm_hook(layer_idx, norm_type, prompt_id, prompt_text):
    def hook(module, input, output):
        try:
            x = input[0] if isinstance(input, tuple) else input
            if x is None or x.dim() != 3: return
            for pos in range(x.shape[1]):
                if not should_capture_position(pos): continue
                vec = x[0, pos, :].detach().cpu().float().numpy()
                captured_activations["layer_norms"].append({
                    "prompt_id": prompt_id, "prompt_text": prompt_text,
                    "layer": layer_idx, "position": get_adjusted_position(pos),
                    "abs_position": pos, "norm_type": norm_type,
                    "mean": float(np.mean(vec)), "variance": float(np.var(vec)),
                })
        except Exception as e: print(f"  Warning: layer norm hook error layer {layer_idx}: {e}")
    return hook

def run_model_with_hooks(model, tokenizer, prompt_id, prompt_text):
    global final_layer_hidden_states, _qkv_cache, RESPONSE_START_POSITION
    final_layer_hidden_states = None
    _qkv_cache = {}
    
    print(f"  Tokenizing prompt {prompt_id + 1}/{len(PROMPTS)}: {prompt_text[:50]}...")
    
    messages = [{"role": "user", "content": prompt_text}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    inputs = tokenizer(text, return_tensors="pt")
    input_ids = inputs["input_ids"]
    
    num_input_tokens = input_ids.shape[1]
    RESPONSE_START_POSITION = num_input_tokens  # Only capture response tokens
    print(f"  Total input tokens: {num_input_tokens}")
    
    print("  Generating (greedy, thinking disabled)...")
    with torch.no_grad():
        gen_outputs = model.generate(input_ids, max_new_tokens=32, output_scores=True,
                                      return_dict_in_generate=True, do_sample=False)
    
    all_token_ids = gen_outputs.sequences[0]
    num_generated = len(all_token_ids) - num_input_tokens
    print(f"  Generated: {tokenizer.decode(all_token_ids[num_input_tokens:], skip_special_tokens=True)[:100]}")
    print(f"  Capturing {num_generated} response tokens (starting at position {RESPONSE_START_POSITION})")
    
    print("  Running forward pass with hooks...")
    forward_start = time.time()
    hooks = []
    
    if hasattr(model.model, "embed_tokens"):
        hooks.append(model.model.embed_tokens.register_forward_hook(
            lambda m, i, o: capture_hidden_state_hook(-1, prompt_id, prompt_text)(m, i, (o,))))
    
    for layer_idx in range(NUM_LAYERS):
        layer = model.model.layers[layer_idx]
        def make_layer_hook(lidx):
            def lh(m, i, o): capture_hidden_state_hook(lidx, prompt_id, prompt_text)(m, i, o if isinstance(o, tuple) else (o,))
            return lh
        hooks.append(layer.register_forward_hook(make_layer_hook(layer_idx)))
        
        if hasattr(layer, "input_layernorm"):
            hooks.append(layer.input_layernorm.register_forward_hook(capture_layer_norm_hook(layer_idx, "input", prompt_id, prompt_text)))
        if hasattr(layer, "self_attn"):
            attn = layer.self_attn
            if hasattr(attn, "q_proj"): hooks.append(attn.q_proj.register_forward_hook(capture_q_proj_hook(layer_idx)))
            if hasattr(attn, "k_proj"): hooks.append(attn.k_proj.register_forward_hook(capture_k_proj_hook(layer_idx)))
            if hasattr(attn, "v_proj"): hooks.append(attn.v_proj.register_forward_hook(capture_v_proj_hook(layer_idx)))
            def make_attn_post(lidx):
                def ap(m, i, o): process_qkv_scores(lidx, prompt_id, prompt_text)
                return ap
            hooks.append(attn.register_forward_hook(make_attn_post(layer_idx)))
        if hasattr(layer, "post_attention_layernorm"):
            hooks.append(layer.post_attention_layernorm.register_forward_hook(capture_layer_norm_hook(layer_idx, "post_attn", prompt_id, prompt_text)))
        if hasattr(layer.mlp, "gate_proj"): hooks.append(layer.mlp.gate_proj.register_forward_hook(capture_mlp_hook(layer_idx, "gate", prompt_id, prompt_text)))
        if hasattr(layer.mlp, "up_proj"): hooks.append(layer.mlp.up_proj.register_forward_hook(capture_mlp_hook(layer_idx, "up", prompt_id, prompt_text)))
        if hasattr(layer.mlp, "down_proj"): hooks.append(layer.mlp.down_proj.register_forward_hook(capture_mlp_hook(layer_idx, "down", prompt_id, prompt_text)))
    
    if hasattr(model.model, "norm"):
        def final_norm_hook(module, input, output):
            global final_layer_hidden_states
            hidden = output[0] if isinstance(output, tuple) else output
            if hidden is not None and hidden.dim() == 3:
                final_layer_hidden_states = hidden[0].detach().cpu().float()
            capture_hidden_state_hook(NUM_LAYERS, prompt_id, prompt_text)(module, input, output if isinstance(output, tuple) else (output,))
        hooks.append(model.model.norm.register_forward_hook(final_norm_hook))
    
    with torch.no_grad():
        full_outputs = model(all_token_ids.unsqueeze(0), output_attentions=True, output_hidden_states=True, return_dict=True)
    
    for hook in hooks: hook.remove()
    
    tokens_lookup = {}
    forward_logits = full_outputs.logits[0]
    
    for pos in range(len(all_token_ids)):
        if not should_capture_position(pos): continue
        token_id = int(all_token_ids[pos].item())
        token_text = tokenizer.decode([token_id])
        is_input = pos < num_input_tokens
        token_role = "user" if pos < num_input_tokens else "assistant"
        
        log_prob = None
        if not is_input:
            gen_pos = pos - num_input_tokens
            if gen_outputs.scores and 0 <= gen_pos < len(gen_outputs.scores):
                log_prob = float(F.log_softmax(gen_outputs.scores[gen_pos][0], dim=-1)[token_id].item())
        
        adj_pos = get_adjusted_position(pos)
        tokens_lookup[adj_pos] = (token_id, token_text)
        captured_activations["tokens"].append({
            "prompt_id": prompt_id, "prompt_text": prompt_text,
            "position": adj_pos, "abs_position": pos, "token_id": token_id,
            "token_text": token_text, "token_role": token_role,
            "is_input": is_input, "log_prob": log_prob,
        })
    
    # Process attention patterns
    if hasattr(full_outputs, "attentions") and full_outputs.attentions:
        print("  Processing attention patterns...")
        attn_dfs = []
        for layer_idx, attn in enumerate(full_outputs.attentions):
            if attn is None: continue
            attn_np = attn[0].detach().cpu().float().numpy()
            _, num_heads, seq_len, _ = attn.shape
            valid_pos = [p for p in range(seq_len) if should_capture_position(p)]
            rows = [{"prompt_id": np.int16(prompt_id), "prompt_text": prompt_text,
                     "layer": np.int16(layer_idx), "head": np.int16(h),
                     "kv_head": np.int16(h // (NUM_HEADS // NUM_KV_HEADS)) if NUM_HEADS > NUM_KV_HEADS else np.int16(h),
                     "query_pos": np.int32(get_adjusted_position(qp)),
                     "key_pos": np.int32(get_adjusted_position(kp)),
                     "weight": np.float32(attn_np[h, qp, kp])}
                    for h in range(num_heads) for qp in valid_pos for kp in valid_pos]
            if rows: attn_dfs.append(pd.DataFrame(rows))
        if attn_dfs:
            captured_activations["attention_patterns_df"] = pd.concat(attn_dfs, ignore_index=True)
            captured_activations["attention_patterns"] = captured_activations["attention_patterns_df"].to_dict('records')
    
    print(f"  ✓ Forward pass: {time.time() - forward_start:.1f}s")
    print(f"  Captured: {len(captured_activations['tokens'])} tokens, {len(captured_activations['hidden_states'])} hidden, {len(captured_activations['mlp_activations'])} MLP")
    
    return tokens_lookup, final_layer_hidden_states, full_outputs


def create_activation_snapshot(prompt_id, prompt_text, tokens_lookup):
    rows = []
    for t in captured_activations["tokens"]:
        if t.get("prompt_id") == prompt_id:
            rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "type": "token",
                         "position": t["position"], "token_id": t["token_id"], "token_text": t["token_text"],
                         "token_role": t.get("token_role"), "is_input": t["is_input"], "log_prob": t["log_prob"],
                         "layer": None, "norm_type": None, "mean": None, "variance": None})
    for n in captured_activations["layer_norms"]:
        if n.get("prompt_id") == prompt_id:
            rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "type": "norm",
                         "position": n["position"], "token_id": tokens_lookup.get(n["position"], (None,))[0],
                         "token_text": None, "token_role": None, "is_input": None, "log_prob": None,
                         "layer": n["layer"], "norm_type": n["norm_type"], "mean": n["mean"], "variance": n["variance"]})
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["token_id"] = df["token_id"].astype("Int32")
        df["layer"] = df["layer"].astype("Int16")
    return df


def create_hidden_states(prompt_id, prompt_text, tokens_lookup):
    states = [{"prompt_id": prompt_id, "prompt_text": prompt_text, "layer": s["layer"],
               "position": s["position"], "token_id": tokens_lookup.get(s["position"], (None,))[0], "values": s["values"]}
              for s in captured_activations["hidden_states"] if s.get("prompt_id") == prompt_id and "type" not in s]
    df = pd.DataFrame(states)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["position"] = df["position"].astype("int32")
    return df


def create_attention_patterns(prompt_id, prompt_text):
    if "attention_patterns_df" in captured_activations:
        return captured_activations["attention_patterns_df"][captured_activations["attention_patterns_df"]["prompt_id"] == prompt_id].copy()
    return pd.DataFrame()


def create_attention_scores(prompt_id, prompt_text):
    if "attention_scores_dfs" in captured_activations and captured_activations["attention_scores_dfs"]:
        df = pd.concat(captured_activations["attention_scores_dfs"], ignore_index=True)
        return df[df["prompt_id"] == prompt_id].copy()
    return pd.DataFrame()


def compute_attn_head_metrics(prompt_id, prompt_text, tokens_lookup, full_outputs_attentions=None):
    if not full_outputs_attentions: return pd.DataFrame()
    rows = []
    for layer_idx, attn in enumerate(full_outputs_attentions):
        if attn is None: continue
        attn_np = attn[0].detach().cpu().float().numpy()
        num_heads, seq_len = attn_np.shape[0], attn_np.shape[1]
        valid_pos = [p for p in range(seq_len) if should_capture_position(p)]
        
        entropy = -np.sum(attn_np * np.log(attn_np + 1e-10), axis=-1)
        sorted_attn = np.sort(attn_np, axis=-1)[:, :, ::-1]
        top1, topk = sorted_attn[:, :, 0], np.sum(sorted_attn[:, :, :10], axis=-1)
        diag = np.diagonal(attn_np, axis1=-2, axis2=-1)
        band = np.zeros((num_heads, seq_len))
        for qp in range(seq_len):
            band[:, qp] = np.sum(attn_np[:, qp, max(0,qp-2):min(seq_len,qp+3)], axis=-1)
        
        for h in range(num_heads):
            for qp in valid_pos:
                adj = get_adjusted_position(qp)
                rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "layer": layer_idx, "head": h,
                             "position": adj, "query_token_id": tokens_lookup.get(adj, (None,))[0],
                             "entropy": float(entropy[h, qp]), "top1_mass": float(top1[h, qp]),
                             "topk_mass": float(topk[h, qp]), "diagonal_mass": float(diag[h, qp]),
                             "band_mass": float(band[h, qp]), "score_sharpness": 0.0})
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["head"] = df["head"].astype("int16")
        df["position"] = df["position"].astype("int32")
    return df


def compute_mlp_metrics(prompt_id, prompt_text, tokens_lookup):
    rows = []
    for a in captured_activations["mlp_activations"]:
        if a.get("prompt_id") != prompt_id: continue
        vals = np.array(a["values"])
        l2 = float(np.linalg.norm(vals))
        sparsity = float(np.mean(vals > 0))
        max_act = float(np.max(vals)) if len(vals) > 0 else 0.0
        mean_act = float(np.mean(vals)) if len(vals) > 0 else 0.0
        sq = vals ** 2
        topk = float(np.sum(np.sort(sq)[::-1][:10]) / (np.sum(sq) + 1e-10))
        rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "layer": a["layer"],
                     "position": a["position"], "token_id": tokens_lookup.get(a["position"], (None,))[0],
                     "stage": a["stage"], "l2_norm": l2, "sparsity": sparsity,
                     "max_activation": max_act, "mean_activation": mean_act, "topk_energy": topk})
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["stage"] = df["stage"].astype("string")
        for c in ["l2_norm", "max_activation", "mean_activation"]:
            df[f"{c}_norm"] = df.groupby("layer")[c].transform(lambda x: (x - x.mean()) / (x.std() + 1e-8)).astype("float32")
    return df


def compute_hidden_metrics(prompt_id, prompt_text, tokens_lookup):
    states = [s for s in captured_activations["hidden_states"] if s.get("prompt_id") == prompt_id and "type" not in s]
    if not states: return pd.DataFrame()
    state_dict = {(s["layer"], s["position"]): np.array(s["values"]) for s in states}
    rows = []
    for (layer, pos), vec in state_dict.items():
        norm = float(np.linalg.norm(vec))
        cos_sim = np.nan
        prev_key = (-1 if layer == 0 else layer - 1, pos)
        if layer != -1 and prev_key in state_dict:
            prev = state_dict[prev_key]
            pn = np.linalg.norm(prev)
            if pn > 0 and norm > 0: cos_sim = float(np.dot(vec, prev) / (norm * pn))
        rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "layer": layer,
                     "position": pos, "token_id": tokens_lookup.get(pos, (None,))[0],
                     "hidden_norm": norm, "cosine_similarity_prev_layer": cos_sim})
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["position"] = df["position"].astype("int32")
    return df


def compute_head_contrib_metrics(prompt_id, prompt_text, tokens_lookup, model, final_hidden, full_outputs_attentions=None, full_outputs_hidden_states=None):
    if final_hidden is None: return pd.DataFrame()
    if hasattr(model, "lm_head"): unembed = model.lm_head.weight.detach().cpu().float()
    elif hasattr(model.model, "embed_tokens"): unembed = model.model.embed_tokens.weight.detach().cpu().float()
    else: return pd.DataFrame()
    
    with torch.no_grad():
        argmax_ids = torch.argmax(torch.matmul(final_hidden, unembed.T), dim=-1).numpy()
    argmax_tokens = {get_adjusted_position(p): int(argmax_ids[p]) for p in range(len(argmax_ids)) if should_capture_position(p)}
    
    qkv_acts = [q for q in captured_activations["qkv_activations"] if q.get("prompt_id") == prompt_id]
    v_cache = {}
    for q in qkv_acts:
        v_cache.setdefault(q["layer"], {}).setdefault(q["head"], {})[q["position"]] = np.array(q["v_values"])
    
    valid_pos = sorted(set(q["position"] for q in qkv_acts))
    rows = []
    
    for layer in range(NUM_LAYERS):
        if layer not in v_cache or not full_outputs_attentions or layer >= len(full_outputs_attentions): continue
        attn_full = full_outputs_attentions[layer][0].detach().cpu().float().numpy()
        seq_len = len(valid_pos)
        if seq_len == 0: continue
        
        attn_np = np.zeros((NUM_HEADS, seq_len, seq_len))
        for i, qp in enumerate(valid_pos):
            qabs = qp + RESPONSE_START_POSITION
            for j, kp in enumerate(valid_pos):
                kabs = kp + RESPONSE_START_POSITION
                if qabs < attn_full.shape[1] and kabs < attn_full.shape[2]:
                    attn_np[:, i, j] = attn_full[:, qabs, kabs]
        
        try: o_proj = model.model.layers[layer].self_attn.o_proj.weight.detach().cpu().float()
        except: continue
        
        v_mats = {}
        for h in range(NUM_HEADS):
            if h not in v_cache.get(layer, {}): continue
            vm = np.zeros((seq_len, HEAD_DIM))
            for i, p in enumerate(valid_pos):
                if p in v_cache[layer][h]: vm[i] = v_cache[layer][h][p]
            v_mats[h] = vm
        
        if len(v_mats) == NUM_HEADS:
            v_stack = np.stack([v_mats[h] for h in range(NUM_HEADS)], axis=0)
            head_out = np.einsum("hsq, hqd -> hsd", attn_np, v_stack)
            w_slices = np.stack([o_proj[:, h*HEAD_DIM:(h+1)*HEAD_DIM].numpy() for h in range(NUM_HEADS)], axis=0)
            contrib = np.einsum("hsd, hDd -> hsD", head_out, w_slices)
            unembed_mat = np.array([unembed[argmax_tokens.get(p, 0)].numpy() if p in argmax_tokens else np.zeros(HIDDEN_SIZE) for p in valid_pos])
            c2a = np.einsum("hsD, sD -> hs", contrib, unembed_mat)
            c_l2 = np.linalg.norm(contrib, axis=-1)
            un = np.linalg.norm(unembed_mat, axis=-1)
            c2a_n = c2a / (c_l2 * un[None, :] + 1e-8)
            
            for h in range(NUM_HEADS):
                for i, p in enumerate(valid_pos):
                    if p not in argmax_tokens: continue
                    rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "layer": layer, "head": h,
                                 "position": p, "query_token_id": tokens_lookup.get(p, (None,))[0],
                                 "argmax_token_id": argmax_tokens[p], "contrib_l2": float(c_l2[h, i]),
                                 "contrib_to_argmax_logit": float(c2a[h, i]),
                                 "contrib_to_argmax_logit_normed": float(c2a_n[h, i])})
    
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["head"] = df["head"].astype("int16")
        df["position"] = df["position"].astype("int32")
    return df


def create_mlp_topk(prompt_id, prompt_text, tokens_lookup, k=50):
    rows = []
    for a in captured_activations["mlp_activations"]:
        if a.get("prompt_id") != prompt_id: continue
        vals = np.array(a["values"])
        top_idx = np.argsort(np.abs(vals))[-k:][::-1]
        for rank, nid in enumerate(top_idx):
            rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "position": a["position"],
                         "layer": a["layer"], "stage": a["stage"], "neuron_rank": rank,
                         "neuron_id": int(nid), "value": float(vals[nid])})
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["layer"] = df["layer"].astype("int16")
        df["stage"] = df["stage"].astype("string")
    return df


def create_hidden_topk(prompt_id, prompt_text, tokens_lookup, k=50):
    states = [s for s in captured_activations["hidden_states"] if s.get("prompt_id") == prompt_id and "type" not in s]
    if not states: return pd.DataFrame()
    stacked = np.array([s["values"] for s in states])
    top_dims = np.argsort(np.var(stacked, axis=0))[-k:][::-1]
    rows = []
    for s in states:
        vals = np.array(s["values"])
        for rank, did in enumerate(top_dims):
            rows.append({"prompt_id": prompt_id, "prompt_text": prompt_text, "position": s["position"],
                         "layer": s["layer"], "dim_rank": rank, "dim_id": int(did), "value": float(vals[did])})
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["layer"] = df["layer"].astype("int16")
    return df


def save_parquet(df, filename, append=False):
    filepath = OUTPUT_DIR / filename
    if append and filepath.exists():
        df = pd.concat([pd.read_parquet(filepath), df], ignore_index=True)
    df.to_parquet(filepath, index=False, compression="snappy")
    print(f"  Saved {filename}: {len(df):,} rows, {filepath.stat().st_size / 1024:.1f} KB")


def main():
    print("=" * 60)
    print("SmolLM3-3B Activation Capture")
    print("Using chat template with enable_thinking=False")
    print("Only capturing tokens from user message onward")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print("\n1. Loading model...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    config = AutoConfig.from_pretrained(MODEL_ID)
    initialize_config(config.to_dict())
    print(f"   Config: {NUM_LAYERS} layers, {HIDDEN_SIZE} hidden, {NUM_HEADS} heads")
    
    model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16,
                                                  low_cpu_mem_usage=True, attn_implementation="eager").to("cpu")
    
    print(f"\n2. Processing {len(PROMPTS)} prompts...")
    
    for prompt_id, prompt_text in enumerate(PROMPTS):
        print(f"\n{'='*60}\nPrompt {prompt_id + 1}/{len(PROMPTS)}\n{'='*60}")
        for key in captured_activations: captured_activations[key] = []
        
        tokens_lookup, final_hidden, full_outputs = run_model_with_hooks(model, tokenizer, prompt_id, prompt_text)
        
        print("\n  Creating parquet files...")
        save_parquet(create_activation_snapshot(prompt_id, prompt_text, tokens_lookup), "activation_snapshot.parquet", prompt_id > 0)
        save_parquet(create_hidden_states(prompt_id, prompt_text, tokens_lookup), "hidden_states.parquet", prompt_id > 0)
        save_parquet(create_attention_patterns(prompt_id, prompt_text), "attention_patterns.parquet", prompt_id > 0)
        if SAVE_ATTENTION_SCORES:
            save_parquet(create_attention_scores(prompt_id, prompt_text), "attention_scores.parquet", prompt_id > 0)
        save_parquet(create_mlp_topk(prompt_id, prompt_text, tokens_lookup), "mlp_topk.parquet", prompt_id > 0)
        save_parquet(create_hidden_topk(prompt_id, prompt_text, tokens_lookup), "hidden_topk.parquet", prompt_id > 0)
        
        print("\n  Computing metrics...")
        attn = full_outputs.attentions if hasattr(full_outputs, 'attentions') else None
        save_parquet(compute_attn_head_metrics(prompt_id, prompt_text, tokens_lookup, attn), "attn_head_metrics.parquet", prompt_id > 0)
        save_parquet(compute_mlp_metrics(prompt_id, prompt_text, tokens_lookup), "mlp_metrics.parquet", prompt_id > 0)
        save_parquet(compute_hidden_metrics(prompt_id, prompt_text, tokens_lookup), "hidden_metrics.parquet", prompt_id > 0)
        save_parquet(compute_head_contrib_metrics(prompt_id, prompt_text, tokens_lookup, model, final_hidden, attn), "head_contrib_metrics.parquet", prompt_id > 0)
    
    print("\n" + "=" * 60)
    print("Complete!")
    print("=" * 60)
    total = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.parquet"))
    print(f"Total: {total / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()