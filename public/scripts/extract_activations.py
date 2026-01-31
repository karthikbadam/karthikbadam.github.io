#!/usr/bin/env python3
"""
Capture live activations from SmolLM3-3B for visualization.

Runs 5 fixed prompts sequentially with deterministic generation (max_new_tokens=32).

Outputs 9 parquet files:
    Base files (5):
    1. activation_snapshot.parquet - Tokens + layer norm stats (with prompt_id, token_id/token_text)
    2. hidden_states.parquet       - Full hidden state vectors (all dimensions, with prompt_id, token_id)
    3. attention_patterns.parquet  - Full attention weight matrices (post-softmax, with prompt_id, query_pos/key_pos)
    4. attention_scores.parquet    - Full pre-softmax attention scores (Q·K^T, with prompt_id, query_pos/key_pos)
    5. mlp_activations.parquet     - Full MLP intermediate activation vectors (with prompt_id, token_id)
    
    Derived metric files (4):
    6. attn_head_metrics.parquet   - Attention head metrics (entropy, top-k mass, diagonal/band mass, score sharpness)
    7. mlp_metrics.parquet         - MLP metrics (gate sparsity, top-k energy, L2 norms)
    8. hidden_metrics.parquet      - Hidden state metrics (hidden norm, cosine similarity with previous layer)
    9. head_contrib_metrics.parquet - Head contribution metrics (contrib_l2, contrib_to_argmax_logit, normalized)

All files include prompt_id and prompt_text. Token metadata (token_id, token_text) is stored in activation_snapshot;
other files use token_id (joinable via position) to avoid bloating large tables.

Usage:
    pip install transformers torch pyarrow pandas numpy
    python public/scripts/extract_activations.py
"""

import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import time
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

# Prompts - constrained Q&A that force sharper decisions
PROMPTS = [
    "What is the black hole information paradox? Answer in one sentence.",
    "Explain quantum entanglement in simple terms. Answer in two short bullet points.",
    "Compute 587 + 678 =",
    "If A maps to B, C maps to D, and E maps to F, then A maps to",
    "Alice is taller than Bob. Bob is taller than Charlie. Who is the tallest? Answer with one word."
]
MAX_NEW_TOKENS = 32  # Fixed for all prompts (increased from 10 to handle bullet points and longer responses)

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


# Storage for captured activations (will be cleared/reset per prompt)
captured_activations = {
    "hidden_states": [],  # List of (layer, position, hidden_state)
    "attention_patterns": [],  # List of (layer, head, query_pos, key_pos, weight)
    "attention_scores": [],  # List of (layer, head, query_pos, key_pos, score) - pre-softmax
    "qkv_activations": [],  # List of (layer, head, position, q_values, k_values, v_values) - full vectors
    "mlp_activations": [],  # List of (layer, position, stage, activation)
    "layer_norms": [],  # List of (layer, position, norm_type, mean, variance)
    "tokens": [],  # List of (position, token_id, token_text, is_input, log_prob)
}

# Global storage for final layer hidden states (for argmax computation)
final_layer_hidden_states = None

# Flag to control whether to save attention_scores (large file)
SAVE_ATTENTION_SCORES = True  # Set to True for debugging or specific layers


def capture_hidden_state_hook(layer_idx: int, prompt_id: int, prompt_text: str):
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
                    "prompt_id": prompt_id,
                    "prompt_text": prompt_text,
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

def process_qkv_scores(layer_idx: int, prompt_id: int, prompt_text: str):
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
        
        # Store FULL pre-softmax scores (all positions, not sparse) - only if flag is set
        if SAVE_ATTENTION_SCORES:
            # Vectorized construction - build DataFrame directly
            heads_arr = np.repeat(np.arange(NUM_HEADS, dtype=np.int16), seq_len * seq_len)
            q_pos_arr = np.tile(np.repeat(np.arange(seq_len, dtype=np.int32), seq_len), NUM_HEADS)
            k_pos_arr = np.tile(np.arange(seq_len, dtype=np.int32), NUM_HEADS * seq_len)
            scores_flat = scores_np.flatten().astype(np.float32)
            
            # Build DataFrame directly (much faster than appending dicts)
            df = pd.DataFrame({
                "prompt_id": np.int16(prompt_id),
                "prompt_text": prompt_text,
                "layer": np.int16(layer_idx),
                "head": heads_arr,
                "query_pos": q_pos_arr,
                "key_pos": k_pos_arr,
                "score": scores_flat,
            })
            if "attention_scores_dfs" not in captured_activations:
                captured_activations["attention_scores_dfs"] = []
            captured_activations["attention_scores_dfs"].append(df)
            # Also store as list for backward compatibility
            captured_activations["attention_scores"].extend(df.to_dict('records'))
        
        # Store Q, K, V activations (FULL vectors per head and position)
        for pos in range(seq_len):
            for head in range(NUM_HEADS):
                # Q: (batch, num_heads, seq_len, head_dim)
                q_head_vals = q[0, head, pos, :].detach().cpu().float().numpy()  # (head_dim,)
                
                # K: After repeat_interleave, index by head directly (not kv_head)
                # (kv_head is only for metadata, not for indexing after repeating)
                k_head_vals = k[0, head, pos, :].detach().cpu().float().numpy()  # (head_dim,)
                
                # V: After repeat_interleave, index by head directly (not kv_head)
                if v is not None:
                    v_head_vals = v[0, head, pos, :].detach().cpu().float().numpy()  # (head_dim,)
                else:
                    v_head_vals = np.zeros(HEAD_DIM, dtype=np.float32)
                
                captured_activations["qkv_activations"].append({
                    "prompt_id": prompt_id,
                    "prompt_text": prompt_text,
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


def capture_mlp_hook(layer_idx: int, stage: str, prompt_id: int, prompt_text: str):
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
                    "prompt_id": prompt_id,
                    "prompt_text": prompt_text,
                    "layer": layer_idx,
                    "position": pos,
                    "stage": stage,
                    "values": act.tolist(),  # Full activation vector
                })
        except Exception as e:
            print(f"  Warning: Error in MLP hook for layer {layer_idx}, stage {stage}: {e}")
    
    return hook


def capture_layer_norm_hook(layer_idx: int, norm_type: str, prompt_id: int, prompt_text: str):
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
                    "prompt_id": prompt_id,
                    "prompt_text": prompt_text,
                    "layer": layer_idx,
                    "position": pos,
                    "norm_type": norm_type,
                    "mean": mean,
                    "variance": variance,
                })
        except Exception as e:
            print(f"  Warning: Error in layer norm hook for layer {layer_idx}, type {norm_type}: {e}")
    
    return hook


def run_model_with_hooks(model, tokenizer, prompt_id: int, prompt_text: str):
    """Run model forward pass with hooks to capture activations."""
    global final_layer_hidden_states, _qkv_cache
    final_layer_hidden_states = None
    
    # Clear QKV cache for this prompt
    _qkv_cache = {}
    
    print(f"  Tokenizing prompt {prompt_id + 1}/5: {prompt_text[:50]}...")
    inputs = tokenizer(prompt_text, return_tensors="pt")
    input_ids = inputs["input_ids"]
    
    num_input_tokens = input_ids.shape[1]
    print(f"  Input tokens: {num_input_tokens}")
    
    print("  Generating tokens to get full sequence (no hooks)...")
    
    # First, generate tokens WITHOUT hooks to get the full sequence
    # (Hooks will be registered AFTER generation to avoid polluting caches)
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
    print("  Registering hooks and running FULL forward pass to capture ALL activations...")
    forward_start = time.time()
    
    # NOW register hooks (after generation)
    hooks = []
    
    # Embedding layer
    if hasattr(model.model, "embed_tokens"):
        hook = model.model.embed_tokens.register_forward_hook(
            lambda m, i, o: capture_hidden_state_hook(-1, prompt_id, prompt_text)(m, i, (o,))
        )
        hooks.append(hook)
    
    # Per-layer hooks
    for layer_idx in range(NUM_LAYERS):
        layer = model.model.layers[layer_idx]
        
        # Hook into layer output to capture hidden states after each layer
        def make_layer_hook(lidx):
            def layer_hook(module, input, output):
                # output is typically a tuple (hidden_states, ...) or just hidden_states
                capture_hidden_state_hook(lidx, prompt_id, prompt_text)(module, input, output if isinstance(output, tuple) else (output,))
            return layer_hook
        
        hook = layer.register_forward_hook(make_layer_hook(layer_idx))
        hooks.append(hook)
        
        # Input layer norm
        if hasattr(layer, "input_layernorm"):
            hook = layer.input_layernorm.register_forward_hook(
                capture_layer_norm_hook(layer_idx, "input", prompt_id, prompt_text)
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
                    process_qkv_scores(lidx, prompt_id, prompt_text)
                return attn_post_hook
            
            hook_post = attn.register_forward_hook(make_attn_post_hook(layer_idx))
            hooks.append(hook_post)
        
        # Post-attention layer norm
        if hasattr(layer, "post_attention_layernorm"):
            hook = layer.post_attention_layernorm.register_forward_hook(
                capture_layer_norm_hook(layer_idx, "post_attn", prompt_id, prompt_text)
            )
            hooks.append(hook)
        
        # MLP gate projection
        if hasattr(layer.mlp, "gate_proj"):
            hook = layer.mlp.gate_proj.register_forward_hook(
                capture_mlp_hook(layer_idx, "gate", prompt_id, prompt_text)
            )
            hooks.append(hook)
        
        # MLP up projection
        if hasattr(layer.mlp, "up_proj"):
            hook = layer.mlp.up_proj.register_forward_hook(
                capture_mlp_hook(layer_idx, "up", prompt_id, prompt_text)
            )
            hooks.append(hook)
        
        # MLP down projection
        if hasattr(layer.mlp, "down_proj"):
            hook = layer.mlp.down_proj.register_forward_hook(
                capture_mlp_hook(layer_idx, "down", prompt_id, prompt_text)
            )
            hooks.append(hook)
    
    # Final layer norm - capture post-norm hidden states for argmax computation
    if hasattr(model.model, "norm"):
        def final_norm_hook(module, input, output):
            global final_layer_hidden_states
            if isinstance(output, tuple):
                hidden = output[0]
            else:
                hidden = output
            if hidden is not None and hidden.dim() == 3:
                final_layer_hidden_states = hidden[0].detach().cpu().float()  # (seq_len, hidden_size)
            # Also capture for hidden_states
            capture_hidden_state_hook(NUM_LAYERS, prompt_id, prompt_text)(module, input, output if isinstance(output, tuple) else (output,))
        
        hook = model.model.norm.register_forward_hook(final_norm_hook)
        hooks.append(hook)
    
    # Now run a full forward pass on the complete sequence with hooks registered
    # This ensures we get activations for EVERY position at EVERY layer
    with torch.no_grad():
        full_outputs = model(
            all_token_ids.unsqueeze(0),
            output_attentions=True,
            output_hidden_states=True,
            return_dict=True,
        )
    
    # Decode tokens and create token lookup dict
    tokens_lookup = {}  # {position: (token_id, token_text)}
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
        
        token_id_int = int(token_id.item())
        # Also get raw token string (useful for debugging/analysis)
        try:
            token_str = tokenizer.convert_ids_to_tokens(token_id_int)
        except:
            token_str = None
        tokens_lookup[pos] = (token_id_int, token_text)
        
        captured_activations["tokens"].append({
            "prompt_id": prompt_id,
            "prompt_text": prompt_text,
            "position": pos,
            "token_id": token_id_int,
            "token_text": token_text,
            "token_str": token_str,  # Raw token string (before decoding)
            "is_input": is_input,
            "log_prob": log_prob,
        })
    
    # Process attention patterns from full forward pass outputs
    # Build DataFrames directly instead of appending dicts (much faster)
    attention_patterns_dfs = []
    if hasattr(full_outputs, "attentions") and full_outputs.attentions is not None:
        print("  Processing attention patterns from full forward pass...")
        num_layers = len(full_outputs.attentions)
        # full_outputs.attentions is a tuple of layer attentions
        for layer_idx, attn in enumerate(full_outputs.attentions):
            if attn is None:
                continue
            if layer_idx % 5 == 0 or layer_idx == num_layers - 1:
                print(f"    Processing layer {layer_idx + 1}/{num_layers}...")
            # attn shape: (batch, num_heads, seq_len, seq_len)
            batch, num_heads, seq_len, _ = attn.shape
            attn_np = attn[0].detach().cpu().float().numpy()
            
            # Vectorized construction - build DataFrame directly
            heads_arr = np.repeat(np.arange(num_heads, dtype=np.int16), seq_len * seq_len)
            q_pos_arr = np.tile(np.repeat(np.arange(seq_len, dtype=np.int32), seq_len), num_heads)
            k_pos_arr = np.tile(np.arange(seq_len, dtype=np.int32), num_heads * seq_len)
            weights_flat = attn_np.flatten().astype(np.float32)
            
            # Compute kv_head mapping (for metadata only, not for indexing)
            kv_heads_arr = (heads_arr // (NUM_HEADS // NUM_KV_HEADS)).astype(np.int16) if NUM_HEADS > NUM_KV_HEADS else heads_arr.copy()
            
            # Build DataFrame directly (much faster than appending dicts)
            df = pd.DataFrame({
                "prompt_id": np.int16(prompt_id),
                "prompt_text": prompt_text,
                "layer": np.int16(layer_idx),
                "head": heads_arr,
                "kv_head": kv_heads_arr,
                "query_pos": q_pos_arr,
                "key_pos": k_pos_arr,
                "weight": weights_flat,
            })
            attention_patterns_dfs.append(df)
    
    # Concatenate all layer DataFrames
    if attention_patterns_dfs:
        patterns_df = pd.concat(attention_patterns_dfs, ignore_index=True)
        # Convert to list of dicts for compatibility (or keep as DataFrame)
        captured_activations["attention_patterns_df"] = patterns_df
        # Also store as list for backward compatibility if needed
        captured_activations["attention_patterns"] = patterns_df.to_dict('records')
    
    # Remove hooks
    for hook in hooks:
        hook.remove()
    
    forward_elapsed = time.time() - forward_start
    print(f"  ✓ Forward pass completed in {forward_elapsed:.1f}s")
    print(f"  Captured {len(captured_activations['tokens'])} tokens")
    print(f"  Captured {len(captured_activations['hidden_states'])} hidden states")
    print(f"  Captured {len(captured_activations['attention_patterns'])} attention weights")
    if SAVE_ATTENTION_SCORES:
        print(f"  Captured {len(captured_activations['attention_scores'])} attention scores (pre-softmax)")
    print(f"  Captured {len(captured_activations['qkv_activations'])} Q/K/V activations")
    print(f"  Captured {len(captured_activations['mlp_activations'])} MLP activations")
    print(f"  Captured {len(captured_activations['layer_norms'])} layer norm stats")
    
    return tokens_lookup, final_layer_hidden_states, full_outputs


def create_activation_snapshot(prompt_id: int, prompt_text: str, tokens_lookup: Dict[int, Tuple[int, str]]) -> pd.DataFrame:
    """Create activation_snapshot.parquet with tokens and layer norms."""
    rows = []
    
    # Add tokens
    for token in captured_activations["tokens"]:
        if token.get("prompt_id") == prompt_id:
            rows.append({
                "prompt_id": prompt_id,
                "prompt_text": prompt_text,
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
        if norm.get("prompt_id") == prompt_id:
            pos = norm["position"]
            token_id = tokens_lookup.get(pos, (None, None))[0]
            rows.append({
                "prompt_id": prompt_id,
                "prompt_text": prompt_text,
                "type": "norm",
                "position": pos,
                "token_id": token_id,
                "token_text": None,
                "is_input": None,
                "log_prob": None,
                "layer": norm["layer"],
                "norm_type": norm["norm_type"],
                "mean": norm["mean"],
                "variance": norm["variance"],
            })
    
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["token_id"] = df["token_id"].astype("Int32")
        df["layer"] = df["layer"].astype("Int16")
        df["log_prob"] = df["log_prob"].astype("float32")
        df["mean"] = df["mean"].astype("float32")
        df["variance"] = df["variance"].astype("float32")
    
    return df


def create_hidden_states(prompt_id: int, prompt_text: str, tokens_lookup: Dict[int, Tuple[int, str]]) -> pd.DataFrame:
    """Create hidden_states.parquet with FULL activation vectors."""
    # Filter out attention_output placeholders and filter by prompt_id
    states = []
    for s in captured_activations["hidden_states"]:
        if "type" not in s and s.get("prompt_id") == prompt_id:
            pos = s["position"]
            token_id = tokens_lookup.get(pos, (None, None))[0]
            states.append({
                "prompt_id": prompt_id,
                "prompt_text": prompt_text,
                "layer": s["layer"],
                "position": pos,
                "token_id": token_id,
                "values": s["values"],
            })
    
    df = pd.DataFrame(states)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["token_id"] = df["token_id"].astype("Int32")
    
    # values is a list of floats (full activation vector)
    # PyArrow will handle list columns automatically
    return df


def create_attention_patterns(prompt_id: int, prompt_text: str) -> pd.DataFrame:
    """Create attention_patterns.parquet with sparse attention weights."""
    # Use DataFrame if available (faster), otherwise fall back to list
    if "attention_patterns_df" in captured_activations:
        df = captured_activations["attention_patterns_df"]
        # Filter by prompt_id
        df = df[df["prompt_id"] == prompt_id].copy()
        if len(df) == 0:
            return pd.DataFrame({
                "prompt_id": [], "prompt_text": [], "layer": [], "head": [],
                "kv_head": [], "query_pos": [], "key_pos": [], "weight": [],
            })
        return df
    else:
        # Fallback to list-based approach
        patterns = [p for p in captured_activations["attention_patterns"] if p.get("prompt_id") == prompt_id]
        if len(patterns) == 0:
            return pd.DataFrame({
                "prompt_id": [], "prompt_text": [], "layer": [], "head": [],
                "kv_head": [], "query_pos": [], "key_pos": [], "weight": [],
            })
        df = pd.DataFrame(patterns)
        if len(df) > 0:
            df["prompt_id"] = df["prompt_id"].astype("int16")
            df["layer"] = df["layer"].astype("int16")
            df["head"] = df["head"].astype("int16")
            df["kv_head"] = df["kv_head"].astype("int16")
            df["query_pos"] = df["query_pos"].astype("int32")
            df["key_pos"] = df["key_pos"].astype("int32")
            df["weight"] = df["weight"].astype("float32")
        return df


def create_attention_scores(prompt_id: int, prompt_text: str) -> pd.DataFrame:
    """Create attention_scores.parquet with pre-softmax attention scores."""
    # Use DataFrame list if available (faster), otherwise fall back to list
    if "attention_scores_dfs" in captured_activations and len(captured_activations["attention_scores_dfs"]) > 0:
        df = pd.concat(captured_activations["attention_scores_dfs"], ignore_index=True)
        df = df[df["prompt_id"] == prompt_id].copy()
        if len(df) == 0:
            return pd.DataFrame({
                "prompt_id": [], "prompt_text": [], "layer": [], "head": [],
                "query_pos": [], "key_pos": [], "score": [],
            })
        return df
    else:
        # Fallback to list-based approach
        scores = [s for s in captured_activations["attention_scores"] if s.get("prompt_id") == prompt_id]
        if len(scores) == 0:
            return pd.DataFrame({
                "prompt_id": [], "prompt_text": [], "layer": [], "head": [],
                "query_pos": [], "key_pos": [], "score": [],
            })
        df = pd.DataFrame(scores)
        if len(df) > 0:
            df["prompt_id"] = df["prompt_id"].astype("int16")
            df["layer"] = df["layer"].astype("int16")
            df["head"] = df["head"].astype("int16")
            df["query_pos"] = df["query_pos"].astype("int32")
            df["key_pos"] = df["key_pos"].astype("int32")
            df["score"] = df["score"].astype("float32")
        return df


def create_mlp_activations(prompt_id: int, prompt_text: str, tokens_lookup: Dict[int, Tuple[int, str]]) -> pd.DataFrame:
    """Create mlp_activations.parquet with FULL MLP activation vectors."""
    activations = []
    for a in captured_activations["mlp_activations"]:
        if a.get("prompt_id") == prompt_id:
            pos = a["position"]
            token_id = tokens_lookup.get(pos, (None, None))[0]
            activations.append({
                "prompt_id": prompt_id,
                "prompt_text": prompt_text,
                "layer": a["layer"],
                "position": pos,
                "token_id": token_id,
                "stage": a["stage"],
                "values": a["values"],
            })
    
    df = pd.DataFrame(activations)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["token_id"] = df["token_id"].astype("Int32")
        df["stage"] = df["stage"].astype("string")
    
    # values is a list of floats (full activation vector)
    # PyArrow will handle list columns automatically
    return df


def compute_attn_head_metrics(prompt_id: int, prompt_text: str, tokens_lookup: Dict[int, Tuple[int, str]], 
                                full_outputs_attentions=None) -> pd.DataFrame:
    """Compute attention head metrics: entropy, top-k mass, diagonal/band mass, score sharpness.
    
    Uses dense attention tensors for efficient computation instead of regrouping edges.
    """
    rows = []
    
    if full_outputs_attentions is None:
        return pd.DataFrame({
            "prompt_id": [], "prompt_text": [], "layer": [], "head": [], "position": [],
            "query_token_id": [], "entropy": [], "top1_mass": [], "topk_mass": [],
            "diagonal_mass": [], "band_mass": [], "score_sharpness": [],
        })
    
    num_layers = len(full_outputs_attentions)
    print(f"    Computing metrics for {num_layers} layers...")
    
    # Process each layer using dense attention tensors
    for layer_idx, attn in enumerate(full_outputs_attentions):
        if layer_idx % 5 == 0 or layer_idx == num_layers - 1:
            print(f"      Layer {layer_idx + 1}/{num_layers}...", end="\r")
        if attn is None:
            continue
        
        # attn shape: (batch, num_heads, seq_len, seq_len)
        batch, num_heads, seq_len, _ = attn.shape
        attn_np = attn[0].detach().cpu().float().numpy()  # [num_heads, seq_len, seq_len]
        
        # Compute entropy: (-A * log(A)).sum(-1) -> [num_heads, seq_len]
        attn_log = np.log(attn_np + 1e-10)
        entropy = -np.sum(attn_np * attn_log, axis=-1)  # [num_heads, seq_len]
        
        # Top-1 and top-k (k=10) mass
        # Sort along key dimension and take top-k
        sorted_attn = np.sort(attn_np, axis=-1)[:, :, ::-1]  # [num_heads, seq_len, seq_len] sorted descending
        top1_mass = sorted_attn[:, :, 0]  # [num_heads, seq_len]
        topk_mass = np.sum(sorted_attn[:, :, :10], axis=-1)  # [num_heads, seq_len]
        
        # Diagonal mass (query_pos == key_pos)
        diagonal_mass = np.diagonal(attn_np, axis1=-2, axis2=-1)  # [num_heads, seq_len]
        
        # Band mass (positions within ±2)
        band_mass = np.zeros((num_heads, seq_len), dtype=np.float32)
        for q_pos in range(seq_len):
            k_start = max(0, q_pos - 2)
            k_end = min(seq_len, q_pos + 3)
            band_mass[:, q_pos] = np.sum(attn_np[:, q_pos, k_start:k_end], axis=-1)
        
        # Score sharpness (variance of attention scores) - only if scores are saved
        score_sharpness = np.zeros((num_heads, seq_len), dtype=np.float32)
        if SAVE_ATTENTION_SCORES:
            # Get scores for this layer
            scores = [s for s in captured_activations.get("attention_scores", []) 
                     if s.get("prompt_id") == prompt_id and s.get("layer") == layer_idx]
            if len(scores) > 0:
                # Rebuild score matrix
                score_matrix = np.zeros((num_heads, seq_len, seq_len), dtype=np.float32)
                for s in scores:
                    score_matrix[s["head"], s["query_pos"], s["key_pos"]] = s["score"]
                # Compute variance along key dimension
                score_sharpness = np.var(score_matrix, axis=-1)  # [num_heads, seq_len]
        
        # Build rows for all (head, position) combinations
        for head in range(num_heads):
            for q_pos in range(seq_len):
                query_token_id = tokens_lookup.get(q_pos, (None, None))[0]
                rows.append({
                    "prompt_id": prompt_id,
                    "prompt_text": prompt_text,
                    "layer": layer_idx,
                    "head": head,
                    "position": q_pos,
                    "query_token_id": query_token_id,
                    "entropy": float(entropy[head, q_pos]),
                    "top1_mass": float(top1_mass[head, q_pos]),
                    "topk_mass": float(topk_mass[head, q_pos]),
                    "diagonal_mass": float(diagonal_mass[head, q_pos]),
                    "band_mass": float(band_mass[head, q_pos]),
                    "score_sharpness": float(score_sharpness[head, q_pos]),
                })
    
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["head"] = df["head"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["query_token_id"] = df["query_token_id"].astype("Int32")
        df["entropy"] = df["entropy"].astype("float32")
        df["top1_mass"] = df["top1_mass"].astype("float32")
        df["topk_mass"] = df["topk_mass"].astype("float32")
        df["diagonal_mass"] = df["diagonal_mass"].astype("float32")
        df["band_mass"] = df["band_mass"].astype("float32")
        df["score_sharpness"] = df["score_sharpness"].astype("float32")
    
    return df


def compute_mlp_metrics(prompt_id: int, prompt_text: str, tokens_lookup: Dict[int, Tuple[int, str]]) -> pd.DataFrame:
    """Compute MLP metrics: gate sparsity, top-k energy, L2 norms."""
    rows = []
    
    # Get MLP activations for this prompt
    activations = [a for a in captured_activations["mlp_activations"] if a.get("prompt_id") == prompt_id]
    
    if len(activations) == 0:
        return pd.DataFrame({
            "prompt_id": [], "prompt_text": [], "layer": [], "position": [],
            "token_id": [], "gate_sparsity_proxy": [], "topk_energy_fraction": [],
            "gate_l2_norm": [], "up_l2_norm": [], "down_l2_norm": [],
        })
    
    # Group by (layer, position, stage)
    mlp_dict = {}
    for a in activations:
        key = (a["layer"], a["position"], a["stage"])
        if key not in mlp_dict:
            mlp_dict[key] = []
        mlp_dict[key].append(a)
    
    # Group by (layer, position) to aggregate across stages
    by_pos = {}
    for (layer, pos, stage), act_list in mlp_dict.items():
        key = (layer, pos)
        if key not in by_pos:
            by_pos[key] = {}
        by_pos[key][stage] = act_list[0]["values"]  # Get first activation (should be same for all)
    
    # Compute metrics for each (layer, position)
    for (layer, pos), stages in by_pos.items():
        token_id = tokens_lookup.get(pos, (None, None))[0]
        
        # Gate metrics
        gate_sparsity_proxy = 0.0
        topk_energy_fraction = 0.0
        gate_l2_norm = 0.0
        if "gate" in stages:
            gate_vals = np.array(stages["gate"])
            gate_sparsity_proxy = float(np.mean(gate_vals > 0))  # Fraction > 0
            gate_l2_norm = float(np.linalg.norm(gate_vals))
            
            # Top-k energy fraction (k=10)
            gate_squared = gate_vals ** 2
            total_energy = np.sum(gate_squared)
            if total_energy > 0:
                sorted_indices = np.argsort(gate_squared)[::-1]
                topk_energy = np.sum(gate_squared[sorted_indices[:min(10, len(gate_squared))]])
                topk_energy_fraction = float(topk_energy / total_energy)
        
        # Up and down L2 norms
        up_l2_norm = float(np.linalg.norm(np.array(stages.get("up", []))))
        down_l2_norm = float(np.linalg.norm(np.array(stages.get("down", []))))
        
        rows.append({
            "prompt_id": prompt_id,
            "prompt_text": prompt_text,
            "layer": layer,
            "position": pos,
            "token_id": token_id,
            "gate_sparsity_proxy": gate_sparsity_proxy,
            "topk_energy_fraction": topk_energy_fraction,
            "gate_l2_norm": gate_l2_norm,
            "up_l2_norm": up_l2_norm,
            "down_l2_norm": down_l2_norm,
        })
    
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["token_id"] = df["token_id"].astype("Int32")
        df["gate_sparsity_proxy"] = df["gate_sparsity_proxy"].astype("float32")
        df["topk_energy_fraction"] = df["topk_energy_fraction"].astype("float32")
        df["gate_l2_norm"] = df["gate_l2_norm"].astype("float32")
        df["up_l2_norm"] = df["up_l2_norm"].astype("float32")
        df["down_l2_norm"] = df["down_l2_norm"].astype("float32")
    
    return df


def compute_hidden_metrics(prompt_id: int, prompt_text: str, tokens_lookup: Dict[int, Tuple[int, str]]) -> pd.DataFrame:
    """Compute hidden state metrics: hidden norm, cosine similarity with previous layer."""
    rows = []
    
    # Get hidden states for this prompt
    states = [s for s in captured_activations["hidden_states"] if s.get("prompt_id") == prompt_id and "type" not in s]
    
    if len(states) == 0:
        return pd.DataFrame({
            "prompt_id": [], "prompt_text": [], "layer": [], "position": [],
            "token_id": [], "hidden_norm": [], "cosine_similarity_prev_layer": [],
        })
    
    # Group by (layer, position)
    state_dict = {}
    for s in states:
        key = (s["layer"], s["position"])
        state_dict[key] = np.array(s["values"])
    
    # Compute metrics for each (layer, position)
    for (layer, pos), hidden_vec in state_dict.items():
        token_id = tokens_lookup.get(pos, (None, None))[0]
        
        # Hidden norm
        hidden_norm = float(np.linalg.norm(hidden_vec))
        
        # Cosine similarity with previous layer
        cosine_sim = np.nan  # Default to NaN
        if layer == -1:
            # Embedding layer - no previous layer (use NaN, not 1.0)
            cosine_sim = np.nan
        elif layer == 0:
            # First layer - compare with embedding
            prev_key = (-1, pos)
            if prev_key in state_dict:
                prev_vec = state_dict[prev_key]
                dot_product = np.dot(hidden_vec, prev_vec)
                prev_norm = np.linalg.norm(prev_vec)
                if prev_norm > 0 and hidden_norm > 0:
                    cosine_sim = float(dot_product / (hidden_norm * prev_norm))
        else:
            # Compare with previous layer
            prev_key = (layer - 1, pos)
            if prev_key in state_dict:
                prev_vec = state_dict[prev_key]
                dot_product = np.dot(hidden_vec, prev_vec)
                prev_norm = np.linalg.norm(prev_vec)
                if prev_norm > 0 and hidden_norm > 0:
                    cosine_sim = float(dot_product / (hidden_norm * prev_norm))
        
        rows.append({
            "prompt_id": prompt_id,
            "prompt_text": prompt_text,
            "layer": layer,
            "position": pos,
            "token_id": token_id,
            "hidden_norm": hidden_norm,
            "cosine_similarity_prev_layer": cosine_sim,
        })
    
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["token_id"] = df["token_id"].astype("Int32")
        df["hidden_norm"] = df["hidden_norm"].astype("float32")
        df["cosine_similarity_prev_layer"] = df["cosine_similarity_prev_layer"].astype("float32")
    
    return df


def compute_head_contrib_metrics(prompt_id: int, prompt_text: str, tokens_lookup: Dict[int, Tuple[int, str]], 
                                  model, final_layer_hidden_states: torch.Tensor, 
                                  full_outputs_attentions=None, full_outputs_hidden_states=None) -> pd.DataFrame:
    """Compute head contribution metrics: contrib_l2, contrib_to_argmax_logit.
    
    Uses dense tensors from full_outputs for efficient computation instead of rebuilding from edges.
    """
    rows = []
    
    if final_layer_hidden_states is None:
        return pd.DataFrame({
            "prompt_id": [], "prompt_text": [], "layer": [], "head": [], "position": [],
            "query_token_id": [], "argmax_token_id": [], "contrib_l2": [],
            "contrib_to_argmax_logit": [], "contrib_to_argmax_logit_normed": [],
        })
    
    # Get unembedding weights
    if hasattr(model, "lm_head") and hasattr(model.lm_head, "weight"):
        unembed_weight = model.lm_head.weight.detach().cpu().float()  # [vocab_size, hidden_dim]
    elif hasattr(model.model, "embed_tokens") and hasattr(model.model.embed_tokens, "weight"):
        unembed_weight = model.model.embed_tokens.weight.detach().cpu().float()  # [vocab_size, hidden_dim]
    else:
        print("  Warning: No unembedding weights found")
        return pd.DataFrame({
            "prompt_id": [], "prompt_text": [], "layer": [], "head": [], "position": [],
            "query_token_id": [], "argmax_token_id": [], "contrib_l2": [],
            "contrib_to_argmax_logit": [], "contrib_to_argmax_logit_normed": [],
        })
    
    # Compute argmax tokens for each position from post-final-norm hidden states
    seq_len = final_layer_hidden_states.shape[0]
    argmax_tokens = {}
    with torch.no_grad():
        logits = torch.matmul(final_layer_hidden_states, unembed_weight.T)  # [seq_len, vocab_size]
        argmax_token_ids = torch.argmax(logits, dim=-1).numpy()  # [seq_len]
        for pos in range(seq_len):
            argmax_tokens[pos] = int(argmax_token_ids[pos])
    
    # Get V activations from qkv_activations (we still need these)
    qkv_acts = [q for q in captured_activations["qkv_activations"] if q.get("prompt_id") == prompt_id and q.get("layer") is not None]
    
    # Group V activations by layer and head
    v_by_layer_head_pos = {}  # {layer: {head: {pos: v_vec}}}
    for qkv in qkv_acts:
        layer = qkv["layer"]
        head = qkv["head"]
        pos = qkv["position"]
        if layer not in v_by_layer_head_pos:
            v_by_layer_head_pos[layer] = {}
        if head not in v_by_layer_head_pos[layer]:
            v_by_layer_head_pos[layer][head] = {}
        v_by_layer_head_pos[layer][head][pos] = np.array(qkv["v_values"])
    
    print(f"    Computing head contributions for {NUM_LAYERS} layers...")
    
    # Process each layer using dense attention tensors from full_outputs
    for layer in range(NUM_LAYERS):
        if layer % 5 == 0 or layer == NUM_LAYERS - 1:
            print(f"      Layer {layer + 1}/{NUM_LAYERS}...", end="\r")
        # Get dense attention tensor from full_outputs (much faster than rebuilding from edges)
        use_dense = (full_outputs_attentions is not None and layer < len(full_outputs_attentions) 
                    and full_outputs_attentions[layer] is not None)
        
        if use_dense:
            attn_dense = full_outputs_attentions[layer]  # [batch, heads, seq, seq]
            attn_np = attn_dense[0].detach().cpu().float().numpy()  # [heads, seq, seq]
            seq_len_layer = attn_np.shape[1]
            # Dense case: positions are 0..seq_len-1
            pos_indices = list(range(seq_len_layer))
            pos_map = {i: i for i in range(seq_len_layer)}  # Identity mapping
        else:
            # Fallback: rebuild from edges (slow, but works)
            patterns = [p for p in captured_activations["attention_patterns"] 
                       if p.get("prompt_id") == prompt_id and p.get("layer") == layer]
            if len(patterns) == 0:
                continue
            all_positions = sorted(set([p["query_pos"] for p in patterns]))
            seq_len_layer = len(all_positions)
            attn_np = np.zeros((NUM_HEADS, seq_len_layer, seq_len_layer))
            pos_map = {all_positions[i]: i for i in range(len(all_positions))}  # token_pos -> index
            for p in patterns:
                head = p["head"]
                q_idx = pos_map[p["query_pos"]]
                k_idx = pos_map[p["key_pos"]]
                attn_np[head, q_idx, k_idx] = p["weight"]
            pos_indices = all_positions  # Actual token positions
        
        # Get W_O weights for this layer
        try:
            o_proj_weight = model.model.layers[layer].self_attn.o_proj.weight.detach().cpu().float()  # [hidden_dim, hidden_dim]
        except:
            continue
        
        # Build V matrix per head from captured activations
        # V shape: [heads, seq, head_dim] - use pos_map to correctly map token positions to indices
        v_matrices = {}
        for head in range(NUM_HEADS):
            if layer not in v_by_layer_head_pos or head not in v_by_layer_head_pos[layer]:
                continue
            v_matrix = np.zeros((seq_len_layer, HEAD_DIM))
            for token_pos in pos_indices:
                # Map token position to matrix index
                idx = pos_map[token_pos]
                if token_pos in v_by_layer_head_pos[layer][head]:
                    v_matrix[idx, :] = v_by_layer_head_pos[layer][head][token_pos]
            v_matrices[head] = v_matrix
        
        # Batch compute head outputs: head_out = A @ V for all heads at once
        # Stack V matrices: [heads, seq, head_dim]
        if len(v_matrices) == NUM_HEADS:
            v_stacked = np.stack([v_matrices[h] for h in range(NUM_HEADS)], axis=0)  # [heads, seq, head_dim]
            
            # Batch matmul: attn_np @ v_stacked
            # attn_np: [heads, seq, seq], v_stacked: [heads, seq, head_dim]
            # Result: [heads, seq, head_dim]
            head_out = np.einsum("hsq, hqd -> hsd", attn_np, v_stacked)  # [heads, seq, head_dim]
            
            # Extract W_O column slices for all heads: [heads, hidden_dim, head_dim]
            w_o_slices = np.stack([
                o_proj_weight[:, h * HEAD_DIM:(h + 1) * HEAD_DIM].numpy()
                for h in range(NUM_HEADS)
            ], axis=0)  # [heads, hidden_dim, head_dim]
            
            # Batch compute contributions: contrib = head_out @ W_O_slices.T
            # head_out: [heads, seq, head_dim], w_o_slices: [heads, hidden_dim, head_dim]
            # contrib: [heads, seq, hidden_dim]
            contrib = np.einsum("hsd, hDd -> hsD", head_out, w_o_slices)  # [heads, seq, hidden_dim]
            
            # Gather unembedding vectors for all argmax tokens: [seq, hidden_dim]
            unembed_matrix = np.array([
                unembed_weight[argmax_tokens.get(pos, 0)].numpy() if pos in argmax_tokens else np.zeros(HIDDEN_SIZE)
                for pos in pos_indices
            ])  # [seq, hidden_dim]
            
            # Batch compute dot products: contrib_to_argmax = (contrib * unembed).sum(-1)
            # contrib: [heads, seq, hidden_dim], unembed_matrix: [seq, hidden_dim]
            contrib_to_argmax = np.einsum("hsD, sD -> hs", contrib, unembed_matrix)  # [heads, seq]
            
            # Compute L2 norms: [heads, seq]
            contrib_l2 = np.linalg.norm(contrib, axis=-1)  # [heads, seq]
            
            # Compute unembed norms: [seq]
            unembed_norms = np.linalg.norm(unembed_matrix, axis=-1)  # [seq]
            
            # Normalized cosine alignment: contrib_to_argmax / (contrib_l2 * unembed_norm + eps)
            eps = 1e-8
            contrib_to_argmax_normed = contrib_to_argmax / (contrib_l2 * unembed_norms[None, :] + eps)  # [heads, seq]
            
            # Build rows from batched results
            for head in range(NUM_HEADS):
                for idx, token_pos in enumerate(pos_indices):
                    argmax_token_id = argmax_tokens.get(token_pos)
                    if argmax_token_id is None:
                        continue
                    
                    query_token_id = tokens_lookup.get(token_pos, (None, None))[0]
                    
                    rows.append({
                        "prompt_id": prompt_id,
                        "prompt_text": prompt_text,
                        "layer": layer,
                        "head": head,
                        "position": token_pos,  # Use actual token position, not index
                        "query_token_id": query_token_id,
                        "argmax_token_id": argmax_token_id,
                        "contrib_l2": float(contrib_l2[head, idx]),
                        "contrib_to_argmax_logit": float(contrib_to_argmax[head, idx]),
                        "contrib_to_argmax_logit_normed": float(contrib_to_argmax_normed[head, idx]),
                    })
        else:
            # Fallback: process heads individually if not all present
            for head in range(NUM_HEADS):
                if head not in v_matrices:
                    continue
                
                attn_matrix = attn_np[head, :, :]  # [seq, seq]
                v_matrix = v_matrices[head]  # [seq, head_dim]
                head_out = np.matmul(attn_matrix, v_matrix)  # [seq, head_dim]
                
                w_o_slice = o_proj_weight[:, head * HEAD_DIM:(head + 1) * HEAD_DIM].numpy()  # [hidden_dim, head_dim]
                contrib = np.matmul(head_out, w_o_slice.T)  # [seq, hidden_dim]
                
                for idx, token_pos in enumerate(pos_indices):
                    contrib_vec = contrib[idx, :]
                    contrib_l2 = float(np.linalg.norm(contrib_vec))
                    
                    argmax_token_id = argmax_tokens.get(token_pos)
                    if argmax_token_id is None:
                        continue
                    
                    unembed_vec = unembed_weight[argmax_token_id].numpy()
                    contrib_to_argmax_logit = float(np.dot(contrib_vec, unembed_vec))
                    
                    unembed_norm = np.linalg.norm(unembed_vec)
                    eps = 1e-8
                    contrib_to_argmax_logit_normed = contrib_to_argmax_logit / (contrib_l2 * unembed_norm + eps)
                    
                    query_token_id = tokens_lookup.get(token_pos, (None, None))[0]
                    
                    rows.append({
                        "prompt_id": prompt_id,
                        "prompt_text": prompt_text,
                        "layer": layer,
                        "head": head,
                        "position": token_pos,
                        "query_token_id": query_token_id,
                        "argmax_token_id": argmax_token_id,
                        "contrib_l2": contrib_l2,
                        "contrib_to_argmax_logit": contrib_to_argmax_logit,
                        "contrib_to_argmax_logit_normed": float(contrib_to_argmax_logit_normed),
                    })
    
    print()  # New line after progress indicators
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df["prompt_id"] = df["prompt_id"].astype("int16")
        df["layer"] = df["layer"].astype("int16")
        df["head"] = df["head"].astype("int16")
        df["position"] = df["position"].astype("int32")
        df["query_token_id"] = df["query_token_id"].astype("Int32")
        df["argmax_token_id"] = df["argmax_token_id"].astype("int32")
        df["contrib_l2"] = df["contrib_l2"].astype("float32")
        df["contrib_to_argmax_logit"] = df["contrib_to_argmax_logit"].astype("float32")
        df["contrib_to_argmax_logit_normed"] = df["contrib_to_argmax_logit_normed"].astype("float32")
    
    return df


def save_parquet(df: pd.DataFrame, filename: str, append: bool = False) -> None:
    """Save DataFrame to Parquet file."""
    filepath = OUTPUT_DIR / filename
    if append and filepath.exists():
        # Read existing file and append
        existing_df = pd.read_parquet(filepath)
        df = pd.concat([existing_df, df], ignore_index=True)
    
    df.to_parquet(filepath, index=False, compression="snappy")
    print(f"  Saved {filename}: {len(df):,} rows, {filepath.stat().st_size / 1024:.1f} KB")


def main():
    """Main extraction pipeline."""
    print("=" * 60)
    print("SmolLM3-3B Activation Capture (Multi-Prompt)")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load model
    print("\n1. Loading model from HuggingFace...")
    print("  This may take a few minutes on first run (downloading ~6GB)...")
    load_start = time.time()
    
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
    
    load_elapsed = time.time() - load_start
    print(f"  ✓ Model loaded in {load_elapsed:.1f}s")
    
    # Process each prompt
    print(f"\n2. Processing {len(PROMPTS)} prompts sequentially...")
    start_time = time.time()
    
    # Clear any existing parquet files (or we'll append)
    # For now, we'll overwrite - change to append if needed
    
    for prompt_id, prompt_text in enumerate(PROMPTS):
        prompt_start_time = time.time()
        print(f"\n{'='*60}")
        print(f"Prompt {prompt_id + 1}/{len(PROMPTS)}")
        print(f"{'='*60}")
        
        # Clear captured activations for this prompt
        for key in captured_activations:
            captured_activations[key] = []
        
        # Run with hooks
        print("\n  Running model with activation hooks...")
        tokens_lookup, final_layer_hidden_states, full_outputs = run_model_with_hooks(model, tokenizer, prompt_id, prompt_text)
        
        # Create base parquet files
        print("\n  Creating base Parquet files...")
        
        print("\n    [1/5] activation_snapshot.parquet")
        snapshot_df = create_activation_snapshot(prompt_id, prompt_text, tokens_lookup)
        save_parquet(snapshot_df, "activation_snapshot.parquet", append=(prompt_id > 0))
        
        print("\n    [2/5] hidden_states.parquet")
        hidden_df = create_hidden_states(prompt_id, prompt_text, tokens_lookup)
        save_parquet(hidden_df, "hidden_states.parquet", append=(prompt_id > 0))
        
        print("\n    [3/5] attention_patterns.parquet")
        attn_df = create_attention_patterns(prompt_id, prompt_text)
        save_parquet(attn_df, "attention_patterns.parquet", append=(prompt_id > 0))
        
        if SAVE_ATTENTION_SCORES:
            print("\n    [4/5] attention_scores.parquet")
            scores_df = create_attention_scores(prompt_id, prompt_text)
            save_parquet(scores_df, "attention_scores.parquet", append=(prompt_id > 0))
        else:
            print("\n    [4/5] attention_scores.parquet (skipped - set SAVE_ATTENTION_SCORES=True to enable)")
        
        print("\n    [5/5] mlp_activations.parquet")
        mlp_df = create_mlp_activations(prompt_id, prompt_text, tokens_lookup)
        save_parquet(mlp_df, "mlp_activations.parquet", append=(prompt_id > 0))
        
        # Compute and save metric parquet files
        print("\n  Computing derived metrics...")
        
        print("\n    [1/4] attn_head_metrics.parquet")
        attn_metrics_df = compute_attn_head_metrics(prompt_id, prompt_text, tokens_lookup, 
                                                     full_outputs.attentions if full_outputs is not None and hasattr(full_outputs, 'attentions') else None)
        save_parquet(attn_metrics_df, "attn_head_metrics.parquet", append=(prompt_id > 0))
        
        print("\n    [2/4] mlp_metrics.parquet")
        mlp_metrics_df = compute_mlp_metrics(prompt_id, prompt_text, tokens_lookup)
        save_parquet(mlp_metrics_df, "mlp_metrics.parquet", append=(prompt_id > 0))
        
        print("\n    [3/4] hidden_metrics.parquet")
        hidden_metrics_df = compute_hidden_metrics(prompt_id, prompt_text, tokens_lookup)
        save_parquet(hidden_metrics_df, "hidden_metrics.parquet", append=(prompt_id > 0))
        
        print("\n    [4/4] head_contrib_metrics.parquet")
        head_contrib_df = compute_head_contrib_metrics(prompt_id, prompt_text, tokens_lookup, model, 
                                                        final_layer_hidden_states,
                                                        full_outputs.attentions if full_outputs is not None and hasattr(full_outputs, 'attentions') else None,
                                                        full_outputs.hidden_states if full_outputs is not None and hasattr(full_outputs, 'hidden_states') else None)
        save_parquet(head_contrib_df, "head_contrib_metrics.parquet", append=(prompt_id > 0))
        
        prompt_elapsed = time.time() - prompt_start_time
        print(f"\n  ✓ Prompt {prompt_id + 1} completed in {prompt_elapsed:.1f}s")
    
    # Summary
    total_elapsed = time.time() - start_time
    print(f"\n  Total time: {total_elapsed:.1f}s ({total_elapsed/60:.1f} minutes)")
    print()
    print("\n" + "=" * 60)
    print("Extraction complete!")
    print("=" * 60)
    print(f"\nOutput directory: {OUTPUT_DIR.absolute()}")
    print(f"\nGenerated files:")
    total_size = 0
    for f in sorted(OUTPUT_DIR.glob("*.parquet")):
        size = f.stat().st_size
        total_size += size
        print(f"  - {f.name}: {size / 1024 / 1024:.2f} MB")
    print(f"\nTotal size: {total_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
