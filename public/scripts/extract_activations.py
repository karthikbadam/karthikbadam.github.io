#!/usr/bin/env python3
"""
Capture live activations from SmolLM3-3B for visualization.

Prompt: "What is the black hole information paradox?"
Generate: 10 tokens

Outputs 5 parquet files:
    1. activation_snapshot.parquet - Tokens + layer norm stats
    2. hidden_states.parquet       - Full hidden state vectors (all dimensions)
    3. attention_patterns.parquet  - Full attention weight matrices (post-softmax)
    4. attention_scores.parquet    - Full pre-softmax attention scores (Q·K^T)
    5. mlp_activations.parquet     - Full MLP intermediate activation vectors

Usage:
    pip install transformers torch pyarrow pandas numpy
    python public/scripts/extract_activations.py
"""

import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer, AutoConfig

# Output directory
OUTPUT_DIR = Path("public/data/llm")

# Model identifier
MODEL_ID = "HuggingFaceTB/SmolLM3-3B"

# Prompt
PROMPT = "What is the black hole information paradox?"
MAX_NEW_TOKENS = 10

# Global config
NUM_LAYERS = None
NUM_HEADS = None
NUM_KV_HEADS = None
HIDDEN_SIZE = None
INTERMEDIATE_SIZE = None
HEAD_DIM = None


def initialize_config(config_dict: Dict[str, Any]) -> None:
    """Initialize global config variables from model config."""
    global NUM_LAYERS, NUM_HEADS, NUM_KV_HEADS, HIDDEN_SIZE
    global INTERMEDIATE_SIZE, HEAD_DIM
    
    NUM_LAYERS = config_dict["num_hidden_layers"]
    NUM_HEADS = config_dict["num_attention_heads"]
    NUM_KV_HEADS = config_dict["num_key_value_heads"]
    HIDDEN_SIZE = config_dict["hidden_size"]
    INTERMEDIATE_SIZE = config_dict["intermediate_size"]
    HEAD_DIM = HIDDEN_SIZE // NUM_HEADS


# Storage for captured activations
captured_activations = {
    "hidden_states": [],  # List of (layer, position, hidden_state)
    "attention_patterns": [],  # List of (layer, head, query_pos, key_pos, weight)
    "attention_scores": [],  # List of (layer, head, query_pos, key_pos, score) - pre-softmax
    "qkv_activations": [],  # List of (layer, head, position, q_values, k_values, v_values) - full vectors
    "mlp_activations": [],  # List of (layer, position, stage, activation)
    "layer_norms": [],  # List of (layer, position, norm_type, mean, variance)
    "tokens": [],  # List of (position, token_id, token_text, is_input, log_prob)
}


def capture_hidden_state_hook(layer_idx: int):
    """Create a hook to capture hidden states."""
    def hook(module, input, output):
        try:
            # output is tuple (hidden_states, ...) or just hidden_states
            if isinstance(output, tuple):
                hidden = output[0]
            else:
                hidden = output
            
            if hidden is None:
                return
            
            # hidden shape: (batch, seq_len, hidden_size)
            if hidden.dim() != 3:
                return
                
            batch_size, seq_len, hidden_size = hidden.shape
            
            for pos in range(seq_len):
                h = hidden[0, pos, :].detach().cpu().float().numpy()
                # Store FULL activation vector, not just aggregated stats
                captured_activations["hidden_states"].append({
                    "layer": layer_idx,
                    "position": pos,
                    "values": h.tolist(),  # Full 2048-dim vector
                })
        except Exception as e:
            print(f"  Warning: Error in hidden state hook for layer {layer_idx}: {e}")
    
    return hook


def capture_attention_hook(layer_idx: int):
    """Create a hook to capture attention Q, K, V activations and scores."""
    def hook(module, input, output):
        try:
            # For Llama-style attention, we need to hook into the forward method
            # The attention module's forward receives (hidden_states, ...)
            # We'll capture Q, K, V from the module's internal computation
            
            # Try to access Q, K, V projections if available
            if hasattr(module, 'q_proj') and hasattr(module, 'k_proj') and hasattr(module, 'v_proj'):
                # We need to hook into the forward pass to capture intermediate values
                # This is tricky - we'll use a forward hook on the attention module itself
                pass  # Will be handled by forward_pre_hook below
            
            # Capture attention output shape for position tracking
            if isinstance(output, tuple):
                attn_out = output[0]
            else:
                attn_out = output
            
            if attn_out is not None and attn_out.dim() == 3:
                batch_size, seq_len, hidden_size = attn_out.shape
                # Store metadata for later processing
                captured_activations["qkv_activations"].append({
                    "layer": layer_idx,
                    "seq_len": seq_len,
                    "type": "metadata",
                })
        except Exception as e:
            print(f"  Warning: Error in attention hook for layer {layer_idx}: {e}")
    
    return hook


# Storage for Q, K, V activations during forward pass
_qkv_cache = {}

def capture_q_proj_hook(layer_idx: int):
    """Hook to capture Q projection output."""
    def hook(module, input, output):
        try:
            if output is None or output.dim() != 3:
                return
            batch_size, seq_len, _ = output.shape
            # Store Q for later score computation
            if layer_idx not in _qkv_cache:
                _qkv_cache[layer_idx] = {}
            _qkv_cache[layer_idx]["q"] = output.detach().cpu().float()
        except Exception as e:
            print(f"  Warning: Error in Q projection hook for layer {layer_idx}: {e}")
    return hook

def capture_k_proj_hook(layer_idx: int):
    """Hook to capture K projection output."""
    def hook(module, input, output):
        try:
            if output is None or output.dim() != 3:
                return
            batch_size, seq_len, _ = output.shape
            # Store K for later score computation
            if layer_idx not in _qkv_cache:
                _qkv_cache[layer_idx] = {}
            _qkv_cache[layer_idx]["k"] = output.detach().cpu().float()
        except Exception as e:
            print(f"  Warning: Error in K projection hook for layer {layer_idx}: {e}")
    return hook

def capture_v_proj_hook(layer_idx: int):
    """Hook to capture V projection output."""
    def hook(module, input, output):
        try:
            if output is None or output.dim() != 3:
                return
            batch_size, seq_len, _ = output.shape
            # Store V
            if layer_idx not in _qkv_cache:
                _qkv_cache[layer_idx] = {}
            _qkv_cache[layer_idx]["v"] = output.detach().cpu().float()
        except Exception as e:
            print(f"  Warning: Error in V projection hook for layer {layer_idx}: {e}")
    return hook

def process_qkv_scores(layer_idx: int):
    """Process cached Q, K, V to compute attention scores."""
    try:
        if layer_idx not in _qkv_cache:
            return
        if "q" not in _qkv_cache[layer_idx] or "k" not in _qkv_cache[layer_idx]:
            return
        
        q = _qkv_cache[layer_idx]["q"]  # (batch, seq_len, num_heads * head_dim)
        k = _qkv_cache[layer_idx]["k"]  # (batch, seq_len, num_kv_heads * head_dim)
        v = _qkv_cache[layer_idx].get("v")
        
        batch_size, seq_len, _ = q.shape
        
        # Reshape for multi-head: (batch, seq_len, num_heads, head_dim)
        q = q.view(batch_size, seq_len, NUM_HEADS, HEAD_DIM)
        k = k.view(batch_size, seq_len, NUM_KV_HEADS, HEAD_DIM)
        if v is not None:
            v = v.view(batch_size, seq_len, NUM_KV_HEADS, HEAD_DIM)
        
        # Transpose for attention: (batch, num_heads, seq_len, head_dim)
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        if v is not None:
            v = v.transpose(1, 2)
        
        # For GQA, repeat K and V to match Q heads
        if NUM_HEADS > NUM_KV_HEADS:
            repeat_factor = NUM_HEADS // NUM_KV_HEADS
            k = k.repeat_interleave(repeat_factor, dim=1)
            if v is not None:
                v = v.repeat_interleave(repeat_factor, dim=1)
        
        # Compute attention scores: Q @ K^T / sqrt(head_dim)
        scores = torch.matmul(q, k.transpose(-2, -1)) / np.sqrt(HEAD_DIM)
        scores_np = scores[0].detach().cpu().float().numpy()  # (num_heads, seq_len, seq_len)
        
        # Store FULL pre-softmax scores (all positions, not sparse)
        for head in range(NUM_HEADS):
            for q_pos in range(seq_len):
                for k_pos in range(seq_len):
                    score = float(scores_np[head, q_pos, k_pos])
                    captured_activations["attention_scores"].append({
                        "layer": layer_idx,
                        "head": head,
                        "query_pos": q_pos,
                        "key_pos": k_pos,
                        "score": score,
                    })
        
        # Store Q, K, V activations (FULL vectors per head and position)
        for pos in range(seq_len):
            for head in range(NUM_HEADS):
                # Q: (batch, num_heads, seq_len, head_dim)
                q_head_vals = q[0, head, pos, :].detach().cpu().float().numpy()  # (head_dim,)
                
                # K: For GQA, map head to kv_head
                kv_head = head // (NUM_HEADS // NUM_KV_HEADS) if NUM_HEADS > NUM_KV_HEADS else head
                k_head_vals = k[0, kv_head, pos, :].detach().cpu().float().numpy()  # (head_dim,)
                
                # V: Same mapping
                if v is not None:
                    v_head_vals = v[0, kv_head, pos, :].detach().cpu().float().numpy()  # (head_dim,)
                else:
                    v_head_vals = np.zeros(HEAD_DIM, dtype=np.float32)
                
                captured_activations["qkv_activations"].append({
                    "layer": layer_idx,
                    "head": head,
                    "position": pos,
                    "q_values": q_head_vals.tolist(),  # Full head_dim vector
                    "k_values": k_head_vals.tolist(),  # Full head_dim vector
                    "v_values": v_head_vals.tolist(),  # Full head_dim vector
                })
        
        # Clear cache for this layer
        del _qkv_cache[layer_idx]
    except Exception as e:
        print(f"  Warning: Error processing QKV scores for layer {layer_idx}: {e}")


def capture_mlp_hook(layer_idx: int, stage: str):
    """Create a hook to capture MLP activations."""
    def hook(module, input, output):
        try:
            if isinstance(output, tuple):
                activation = output[0]
            else:
                activation = output
            
            if activation is None:
                return
            
            # activation shape: (batch, seq_len, dim)
            if activation.dim() != 3:
                return
                
            batch_size, seq_len, dim = activation.shape
            
            for pos in range(seq_len):
                act = activation[0, pos, :].detach().cpu().float().numpy()
                # Store FULL activation vector, not just aggregated stats
                captured_activations["mlp_activations"].append({
                    "layer": layer_idx,
                    "position": pos,
                    "stage": stage,
                    "values": act.tolist(),  # Full activation vector
                })
        except Exception as e:
            print(f"  Warning: Error in MLP hook for layer {layer_idx}, stage {stage}: {e}")
    
    return hook


def capture_layer_norm_hook(layer_idx: int, norm_type: str):
    """Create a hook to capture layer norm statistics."""
    def hook(module, input, output):
        try:
            if isinstance(input, tuple):
                x = input[0]
            else:
                x = input
            
            if x is None:
                return
            
            # x shape: (batch, seq_len, hidden_size)
            if x.dim() != 3:
                return
                
            batch_size, seq_len, hidden_size = x.shape
            
            for pos in range(seq_len):
                vec = x[0, pos, :].detach().cpu().float().numpy()
                mean = float(np.mean(vec))
                variance = float(np.var(vec))
                
                captured_activations["layer_norms"].append({
                    "layer": layer_idx,
                    "position": pos,
                    "norm_type": norm_type,
                    "mean": mean,
                    "variance": variance,
                })
        except Exception as e:
            print(f"  Warning: Error in layer norm hook for layer {layer_idx}, type {norm_type}: {e}")
    
    return hook


def run_model_with_hooks(model, tokenizer):
    """Run model forward pass with hooks to capture activations."""
    print("  Tokenizing prompt...")
    inputs = tokenizer(PROMPT, return_tensors="pt")
    input_ids = inputs["input_ids"]
    
    num_input_tokens = input_ids.shape[1]
    print(f"  Input tokens: {num_input_tokens}")
    
    # Register hooks
    hooks = []
    
    # Embedding layer
    if hasattr(model.model, "embed_tokens"):
        hook = model.model.embed_tokens.register_forward_hook(
            lambda m, i, o: capture_hidden_state_hook(-1)(m, i, (o,))
        )
        hooks.append(hook)
    
    # Per-layer hooks
    for layer_idx in range(NUM_LAYERS):
        layer = model.model.layers[layer_idx]
        
        # Hook into layer output to capture hidden states after each layer
        def make_layer_hook(lidx):
            def layer_hook(module, input, output):
                # output is typically a tuple (hidden_states, ...) or just hidden_states
                capture_hidden_state_hook(lidx)(module, input, output if isinstance(output, tuple) else (output,))
            return layer_hook
        
        hook = layer.register_forward_hook(make_layer_hook(layer_idx))
        hooks.append(hook)
        
        # Input layer norm
        if hasattr(layer, "input_layernorm"):
            hook = layer.input_layernorm.register_forward_hook(
                capture_layer_norm_hook(layer_idx, "input")
            )
            hooks.append(hook)
        
        # Attention - capture Q, K, V and scores
        if hasattr(layer, "self_attn"):
            attn = layer.self_attn
            # Hook into individual projection layers
            if hasattr(attn, "q_proj"):
                hook_q = attn.q_proj.register_forward_hook(capture_q_proj_hook(layer_idx))
                hooks.append(hook_q)
            if hasattr(attn, "k_proj"):
                hook_k = attn.k_proj.register_forward_hook(capture_k_proj_hook(layer_idx))
                hooks.append(hook_k)
            if hasattr(attn, "v_proj"):
                hook_v = attn.v_proj.register_forward_hook(capture_v_proj_hook(layer_idx))
                hooks.append(hook_v)
            
            # Hook after attention to process QKV scores
            def make_attn_post_hook(lidx):
                def attn_post_hook(m, i, o):
                    process_qkv_scores(lidx)
                return attn_post_hook
            
            hook_post = attn.register_forward_hook(make_attn_post_hook(layer_idx))
            hooks.append(hook_post)
        
        # Post-attention layer norm
        if hasattr(layer, "post_attention_layernorm"):
            hook = layer.post_attention_layernorm.register_forward_hook(
                capture_layer_norm_hook(layer_idx, "post_attn")
            )
            hooks.append(hook)
        
        # MLP gate projection
        if hasattr(layer.mlp, "gate_proj"):
            hook = layer.mlp.gate_proj.register_forward_hook(
                capture_mlp_hook(layer_idx, "gate")
            )
            hooks.append(hook)
        
        # MLP up projection
        if hasattr(layer.mlp, "up_proj"):
            hook = layer.mlp.up_proj.register_forward_hook(
                capture_mlp_hook(layer_idx, "up")
            )
            hooks.append(hook)
        
        # MLP down projection
        if hasattr(layer.mlp, "down_proj"):
            hook = layer.mlp.down_proj.register_forward_hook(
                capture_mlp_hook(layer_idx, "down")
            )
            hooks.append(hook)
    
    # Final layer norm
    if hasattr(model.model, "norm"):
        hook = model.model.norm.register_forward_hook(
            lambda m, i, o: capture_hidden_state_hook(NUM_LAYERS)(m, i, (o,))
        )
        hooks.append(hook)
    
    print("  Generating tokens to get full sequence...")
    
    # First, generate tokens WITHOUT hooks to get the full sequence
    # (Hooks would fire during generation but only for new tokens)
    with torch.no_grad():
        outputs = model.generate(
            input_ids,
            max_new_tokens=MAX_NEW_TOKENS,
            output_attentions=False,  # Don't need during generation
            output_hidden_states=False,
            return_dict_in_generate=True,
            do_sample=False,  # Deterministic
        )
    
    # Extract generated token IDs
    generated_ids = outputs.sequences[0, num_input_tokens:]
    all_token_ids = torch.cat([input_ids[0], generated_ids])
    
    print(f"  Full sequence length: {len(all_token_ids)} tokens")
    print("  Running FULL forward pass on complete sequence with hooks to capture ALL activations...")
    
    # Now run a full forward pass on the complete sequence with hooks registered
    # This ensures we get activations for EVERY position at EVERY layer
    with torch.no_grad():
        full_outputs = model(
            all_token_ids.unsqueeze(0),
            output_attentions=True,
            output_hidden_states=True,
            return_dict=True,
        )
    
    # Decode tokens
    for pos, token_id in enumerate(all_token_ids):
        token_text = tokenizer.decode([token_id.item()])
        is_input = pos < num_input_tokens
        
        # Get log probability for generated tokens
        log_prob = None
        if not is_input and hasattr(outputs, "scores") and outputs.scores is not None:
            gen_pos = pos - num_input_tokens
            if gen_pos >= 0 and gen_pos < len(outputs.scores):
                logits = outputs.scores[gen_pos][0]
                probs = F.softmax(logits, dim=-1)
                log_prob = float(torch.log(probs[token_id] + 1e-10))
        
        captured_activations["tokens"].append({
            "position": pos,
            "token_id": int(token_id.item()),
            "token_text": token_text,
            "is_input": is_input,
            "log_prob": log_prob,
        })
    
    # Process attention patterns from full forward pass outputs
    if hasattr(full_outputs, "attentions") and full_outputs.attentions is not None:
        print("  Processing attention patterns from full forward pass...")
        # full_outputs.attentions is a tuple of layer attentions
        for layer_idx, attn in enumerate(full_outputs.attentions):
            if attn is None:
                continue
            # attn shape: (batch, num_heads, seq_len, seq_len)
            batch, num_heads, seq_len, _ = attn.shape
            attn_np = attn[0].detach().cpu().float().numpy()
            
            # Compute entropy per head
            entropy = -np.sum(attn_np * np.log(attn_np + 1e-10), axis=-1).mean(axis=-1)
            
            # Store FULL attention patterns (all positions, not sparse)
            for head in range(num_heads):
                kv_head = head // (NUM_HEADS // NUM_KV_HEADS) if NUM_HEADS > NUM_KV_HEADS else head
                
                for q_pos in range(seq_len):
                    for k_pos in range(seq_len):
                        weight = float(attn_np[head, q_pos, k_pos])
                        captured_activations["attention_patterns"].append({
                            "layer": layer_idx,
                            "head": head,
                            "kv_head": kv_head,
                            "query_pos": q_pos,
                            "key_pos": k_pos,
                            "weight": weight,
                            "entropy": float(entropy[head]) if head < len(entropy) else None,
                        })
    
    # Remove hooks
    for hook in hooks:
        hook.remove()
    
    print(f"  Captured {len(captured_activations['tokens'])} tokens")
    print(f"  Captured {len(captured_activations['hidden_states'])} hidden states")
    print(f"  Captured {len(captured_activations['attention_patterns'])} attention weights")
    print(f"  Captured {len(captured_activations['attention_scores'])} attention scores (pre-softmax)")
    print(f"  Captured {len(captured_activations['qkv_activations'])} Q/K/V activations")
    print(f"  Captured {len(captured_activations['mlp_activations'])} MLP activations")
    print(f"  Captured {len(captured_activations['layer_norms'])} layer norm stats")


def create_activation_snapshot() -> pd.DataFrame:
    """Create activation_snapshot.parquet with tokens and layer norms."""
    rows = []
    
    # Add tokens
    for token in captured_activations["tokens"]:
        rows.append({
            "type": "token",
            "position": token["position"],
            "token_id": token["token_id"],
            "token_text": token["token_text"],
            "is_input": token["is_input"],
            "log_prob": token["log_prob"],
            "layer": None,
            "norm_type": None,
            "mean": None,
            "variance": None,
        })
    
    # Add layer norms
    for norm in captured_activations["layer_norms"]:
        rows.append({
            "type": "norm",
            "position": norm["position"],
            "token_id": None,
            "token_text": None,
            "is_input": None,
            "log_prob": None,
            "layer": norm["layer"],
            "norm_type": norm["norm_type"],
            "mean": norm["mean"],
            "variance": norm["variance"],
        })
    
    df = pd.DataFrame(rows)
    df["position"] = df["position"].astype("int32")
    df["layer"] = df["layer"].astype("Int16")
    df["log_prob"] = df["log_prob"].astype("float32")
    df["mean"] = df["mean"].astype("float32")
    df["variance"] = df["variance"].astype("float32")
    
    return df


def create_hidden_states() -> pd.DataFrame:
    """Create hidden_states.parquet with FULL activation vectors."""
    # Filter out attention_output placeholders
    states = [s for s in captured_activations["hidden_states"] if "type" not in s]
    
    df = pd.DataFrame(states)
    df["layer"] = df["layer"].astype("int16")
    df["position"] = df["position"].astype("int32")
    
    # values is a list of floats (full activation vector)
    # PyArrow will handle list columns automatically
    return df


def create_attention_patterns() -> pd.DataFrame:
    """Create attention_patterns.parquet with sparse attention weights."""
    df = pd.DataFrame(captured_activations["attention_patterns"])
    
    if len(df) == 0:
        # Return empty dataframe with correct schema
        return pd.DataFrame({
            "layer": [],
            "head": [],
            "kv_head": [],
            "query_pos": [],
            "key_pos": [],
            "weight": [],
            "entropy": [],
        })
    
    df["layer"] = df["layer"].astype("int16")
    df["head"] = df["head"].astype("int16")
    df["kv_head"] = df["kv_head"].astype("int16")
    df["query_pos"] = df["query_pos"].astype("int32")
    df["key_pos"] = df["key_pos"].astype("int32")
    df["weight"] = df["weight"].astype("float32")
    df["entropy"] = df["entropy"].astype("float32")
    
    return df


def create_attention_scores() -> pd.DataFrame:
    """Create attention_scores.parquet with pre-softmax attention scores."""
    df = pd.DataFrame(captured_activations["attention_scores"])
    
    if len(df) == 0:
        return pd.DataFrame({
            "layer": [],
            "head": [],
            "query_pos": [],
            "key_pos": [],
            "score": [],
        })
    
    df["layer"] = df["layer"].astype("int16")
    df["head"] = df["head"].astype("int16")
    df["query_pos"] = df["query_pos"].astype("int32")
    df["key_pos"] = df["key_pos"].astype("int32")
    df["score"] = df["score"].astype("float32")
    
    return df


def create_mlp_activations() -> pd.DataFrame:
    """Create mlp_activations.parquet with FULL MLP activation vectors."""
    df = pd.DataFrame(captured_activations["mlp_activations"])
    
    if len(df) == 0:
        return pd.DataFrame({
            "layer": [],
            "position": [],
            "stage": [],
            "values": [],
        })
    
    df["layer"] = df["layer"].astype("int16")
    df["position"] = df["position"].astype("int32")
    df["stage"] = df["stage"].astype("string")
    
    # values is a list of floats (full activation vector)
    # PyArrow will handle list columns automatically
    return df


def save_parquet(df: pd.DataFrame, filename: str) -> None:
    """Save DataFrame to Parquet file."""
    filepath = OUTPUT_DIR / filename
    df.to_parquet(filepath, index=False, compression="snappy")
    print(f"  Saved {filename}: {len(df):,} rows, {filepath.stat().st_size / 1024:.1f} KB")


def main():
    """Main extraction pipeline."""
    print("=" * 60)
    print("SmolLM3-3B Activation Capture")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load model
    print("\n1. Loading model from HuggingFace...")
    print("  This may take a few minutes on first run (downloading ~6GB)...")
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    config = AutoConfig.from_pretrained(MODEL_ID)
    initialize_config(config.to_dict())
    
    print(f"   Config: {NUM_LAYERS} layers, {HIDDEN_SIZE} hidden, {NUM_HEADS} Q heads, {NUM_KV_HEADS} KV heads")
    
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        attn_implementation="eager",  # Required for output_attentions
    )
    model = model.to("cpu")
    
    # Run with hooks
    print("\n2. Running model with activation hooks...")
    run_model_with_hooks(model, tokenizer)
    
    # Create parquet files
    print("\n3. Creating Parquet files...")
    
    print("\n   [1/4] activation_snapshot.parquet")
    snapshot_df = create_activation_snapshot()
    save_parquet(snapshot_df, "activation_snapshot.parquet")
    
    print("\n   [2/4] hidden_states.parquet")
    hidden_df = create_hidden_states()
    save_parquet(hidden_df, "hidden_states.parquet")
    
    print("\n   [3/5] attention_patterns.parquet")
    attn_df = create_attention_patterns()
    save_parquet(attn_df, "attention_patterns.parquet")
    
    print("\n   [4/5] attention_scores.parquet")
    scores_df = create_attention_scores()
    save_parquet(scores_df, "attention_scores.parquet")
    
    print("\n   [5/5] mlp_activations.parquet")
    mlp_df = create_mlp_activations()
    save_parquet(mlp_df, "mlp_activations.parquet")
    
    # Summary
    print("\n" + "=" * 60)
    print("Extraction complete!")
    print("=" * 60)
    print(f"\nOutput directory: {OUTPUT_DIR.absolute()}")
    print(f"\nGenerated files:")
    total_size = 0
    for f in sorted(OUTPUT_DIR.glob("*.parquet")):
        size = f.stat().st_size
        total_size += size
        print(f"  - {f.name}: {size / 1024:.1f} KB")
    print(f"\nTotal size: {total_size / 1024 / 1024:.1f} MB")
    
    print(f"\nRow counts:")
    print(f"  - activation_snapshot: {len(snapshot_df):,}")
    print(f"  - hidden_states: {len(hidden_df):,}")
    print(f"  - attention_patterns: {len(attn_df):,}")
    print(f"  - attention_scores: {len(scores_df):,}")
    print(f"  - mlp_activations: {len(mlp_df):,}")


if __name__ == "__main__":
    main()
