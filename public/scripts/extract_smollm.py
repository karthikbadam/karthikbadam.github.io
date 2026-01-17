#!/usr/bin/env python3
"""
Extract SmolLM3-3B model architecture and weight statistics to Parquet files.

Generates 6 semantic Parquet files in public/data/llm/:
    1. tensors.parquet        - Tensor catalog (~326 rows)
    2. tensor_stats.parquet   - Whole-tensor metrics (~326 rows)
    3. tensor_dims.parquet    - Per-output-dimension metrics (~976k rows)
    4. tensor_blocks.parquet  - Semantic block decomposition (~23k rows)
    5. tensor_block_topk.parquet - Sparse weight anchors (~370k rows)
    6. tensor_relations.parquet  - Semantic relations (~1k rows)

Usage:
    pip install transformers torch pyarrow pandas numpy
    python public/scripts/extract_smollm.py
"""

import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import torch
from transformers import AutoModelForCausalLM, AutoConfig

# Output directory
OUTPUT_DIR = Path("public/data/llm")

# Model identifier
MODEL_ID = "HuggingFaceTB/SmolLM3-3B"

# Global config (populated from model)
NUM_LAYERS = None
NUM_HEADS = None
NUM_KV_HEADS = None
HIDDEN_SIZE = None
INTERMEDIATE_SIZE = None
HEAD_DIM = None
BLOCK_DIM = 128  # Fixed block size for visualization
N_IN_BLOCKS = None
VOCAB_SIZE = None


def load_model_weights() -> Tuple[Dict[str, np.ndarray], Dict[str, Any]]:
    """Load actual model weights from HuggingFace."""
    print(f"Loading model from HuggingFace: {MODEL_ID}")
    print("  This may take a few minutes on first run (downloading ~6GB)...")
    
    config = AutoConfig.from_pretrained(MODEL_ID)
    
    print("  Loading model weights...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
    )
    model = model.to("cpu")
    
    print("  Extracting weight tensors...")
    weights = {}
    for name, param in model.named_parameters():
        if param.dtype == torch.bfloat16:
            param_np = param.detach().cpu().float().numpy()
        else:
            param_np = param.detach().cpu().numpy()
        weights[name] = param_np
    
    # Handle tied embeddings
    if config.tie_word_embeddings:
        if "lm_head.weight" not in weights and "model.embed_tokens.weight" in weights:
            weights["lm_head.weight"] = weights["model.embed_tokens.weight"]
        elif "lm_head.weight" in weights and "model.embed_tokens.weight" in weights:
            weights["lm_head.weight"] = weights["model.embed_tokens.weight"]
    
    print(f"  Extracted {len(weights)} weight tensors")
    
    return weights, config.to_dict()


def initialize_config(config_dict: Dict[str, Any]) -> None:
    """Initialize global config variables from model config."""
    global NUM_LAYERS, NUM_HEADS, NUM_KV_HEADS, HIDDEN_SIZE
    global INTERMEDIATE_SIZE, HEAD_DIM, N_IN_BLOCKS, VOCAB_SIZE
    
    NUM_LAYERS = config_dict["num_hidden_layers"]
    NUM_HEADS = config_dict["num_attention_heads"]
    NUM_KV_HEADS = config_dict["num_key_value_heads"]
    HIDDEN_SIZE = config_dict["hidden_size"]
    INTERMEDIATE_SIZE = config_dict["intermediate_size"]
    HEAD_DIM = HIDDEN_SIZE // NUM_HEADS
    N_IN_BLOCKS = HIDDEN_SIZE // BLOCK_DIM
    VOCAB_SIZE = config_dict["vocab_size"]


# =============================================================================
# 1. tensors.parquet - Tensor catalog
# =============================================================================

def create_tensors(weights: Dict[str, np.ndarray], config_dict: Dict[str, Any]) -> pd.DataFrame:
    """Create tensors.parquet with canonical tensor_id naming."""
    tensors = []
    
    # Helper to add tensor
    def add_tensor(tensor_id: str, hf_name: str, layer: Optional[int], module: str, 
                   role: str, weight: np.ndarray, is_tied: bool = False, 
                   tied_to: Optional[str] = None):
        tensors.append({
            "tensor_id": tensor_id,
            "hf_name": hf_name,
            "layer": layer,
            "module": module,
            "role": role,
            "ndim": int(weight.ndim),
            "shape_0": int(weight.shape[0]),
            "shape_1": int(weight.shape[1]) if weight.ndim > 1 else None,
            "param_count": int(weight.size) if not is_tied else 0,
            "dtype": "bfloat16",
            "is_tied": is_tied,
            "tied_to_tensor_id": tied_to,
        })
    
    # Global tensors
    embed_w = weights["model.embed_tokens.weight"]
    add_tensor("embed_tokens", "model.embed_tokens.weight", None, "embed", "embed_tokens", embed_w)
    
    # Find final norm
    for key in ["model.norm.weight", "model.layer_norm.weight"]:
        if key in weights:
            add_tensor("final_norm", key, None, "norm", "final_norm", weights[key])
            break
    
    # LM head (tied)
    add_tensor("lm_head", "lm_head.weight", None, "output", "lm_head", embed_w, 
               is_tied=config_dict.get("tie_word_embeddings", True), tied_to="embed_tokens")
    
    # Per-layer tensors
    for layer_idx in range(NUM_LAYERS):
        prefix = f"model.layers.{layer_idx}"
        
        # Norms
        for norm_name, role in [("input_layernorm", "input_norm"), ("post_attention_layernorm", "post_norm")]:
            key = f"{prefix}.{norm_name}.weight"
            if key in weights:
                add_tensor(f"L{layer_idx}.norm.{role}", key, layer_idx, "norm", role, weights[key])
        
        # Attention projections
        for proj in ["q", "k", "v", "o"]:
            key = f"{prefix}.self_attn.{proj}_proj.weight"
            if key in weights:
                add_tensor(f"L{layer_idx}.attn.{proj}", key, layer_idx, "attn", proj, weights[key])
        
        # MLP projections
        for proj in ["gate", "up", "down"]:
            key = f"{prefix}.mlp.{proj}_proj.weight"
            if key in weights:
                add_tensor(f"L{layer_idx}.mlp.{proj}", key, layer_idx, "mlp", proj, weights[key])
    
    df = pd.DataFrame(tensors)
    df["layer"] = df["layer"].astype("Int16")
    df["ndim"] = df["ndim"].astype("int8")
    df["shape_0"] = df["shape_0"].astype("int32")
    df["shape_1"] = df["shape_1"].astype("Int32")
    df["param_count"] = df["param_count"].astype("int64")
    
    return df


# =============================================================================
# 2. tensor_stats.parquet - Whole-tensor metrics
# =============================================================================

def create_tensor_stats(weights: Dict[str, np.ndarray], tensors_df: pd.DataFrame) -> pd.DataFrame:
    """Create tensor_stats.parquet with aggregate stats per tensor."""
    stats = []
    
    for _, row in tensors_df.iterrows():
        tensor_id = row["tensor_id"]
        hf_name = row["hf_name"]
        
        if row["is_tied"] and row["tied_to_tensor_id"]:
            # Skip tied tensors, they share stats with their source
            continue
        
        weight = weights.get(hf_name)
        if weight is None:
            continue
        
        flat = weight.flatten().astype(np.float32)
        abs_flat = np.abs(flat)
        
        stats.append({
            "tensor_id": tensor_id,
            "fro_norm": float(np.linalg.norm(flat)),
            "mean_abs": float(np.mean(abs_flat)),
            "std": float(np.std(flat)),
            "p95_abs": float(np.percentile(abs_flat, 95)),
            "p99_abs": float(np.percentile(abs_flat, 99)),
            "zero_frac": float(np.mean(flat == 0)),
            "min": float(np.min(flat)),
            "max": float(np.max(flat)),
        })
    
    df = pd.DataFrame(stats)
    for col in ["fro_norm", "mean_abs", "std", "p95_abs", "p99_abs", "zero_frac", "min", "max"]:
        df[col] = df[col].astype("float32")
    
    return df


# =============================================================================
# 3. tensor_dims.parquet - Per-output-dimension metrics (~976k rows)
# =============================================================================

def create_tensor_dims(weights: Dict[str, np.ndarray]) -> pd.DataFrame:
    """
    Create tensor_dims.parquet with per-output-dimension metrics.
    
    Attention dims (~110k rows):
    - Q: 16 heads x 128 dims x 36 layers = 73,728 rows
    - K: 4 heads x 128 dims x 36 layers = 18,432 rows
    - V: 4 heads x 128 dims x 36 layers = 18,432 rows
    
    MLP dims (~866k rows):
    - down: 2048 dims x 36 layers = 73,728 rows
    - up: 11008 dims x 36 layers = 396,288 rows
    - gate: 11008 dims x 36 layers = 396,288 rows
    
    Total: ~976,896 rows
    """
    dims = []
    
    print("  Computing per-dimension stats (this may take a minute)...")
    
    for layer_idx in range(NUM_LAYERS):
        prefix = f"model.layers.{layer_idx}"
        
        # Q projection dims (16 heads x 128 dims)
        q_key = f"{prefix}.self_attn.q_proj.weight"
        if q_key in weights:
            q_weight = weights[q_key].astype(np.float32)
            for head in range(NUM_HEADS):
                head_start = head * HEAD_DIM
                for dim in range(HEAD_DIM):
                    row_idx = head_start + dim
                    row = q_weight[row_idx, :]
                    abs_row = np.abs(row)
                    dims.append({
                        "tensor_id": f"L{layer_idx}.attn.q",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": "q",
                        "head_kind": "q_head",
                        "head": head,
                        "dim": dim,
                        "row_l2": float(np.linalg.norm(row)),
                        "row_mean_abs": float(np.mean(abs_row)),
                        "row_std": float(np.std(row)),
                        "row_p95_abs": float(np.percentile(abs_row, 95)),
                        "row_zero_frac": float(np.mean(row == 0)),
                    })
        
        # K projection dims (4 heads x 128 dims)
        k_key = f"{prefix}.self_attn.k_proj.weight"
        if k_key in weights:
            k_weight = weights[k_key].astype(np.float32)
            for head in range(NUM_KV_HEADS):
                head_start = head * HEAD_DIM
                for dim in range(HEAD_DIM):
                    row_idx = head_start + dim
                    row = k_weight[row_idx, :]
                    abs_row = np.abs(row)
                    dims.append({
                        "tensor_id": f"L{layer_idx}.attn.k",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": "k",
                        "head_kind": "kv_head",
                        "head": head,
                        "dim": dim,
                        "row_l2": float(np.linalg.norm(row)),
                        "row_mean_abs": float(np.mean(abs_row)),
                        "row_std": float(np.std(row)),
                        "row_p95_abs": float(np.percentile(abs_row, 95)),
                        "row_zero_frac": float(np.mean(row == 0)),
                    })
        
        # V projection dims (4 heads x 128 dims)
        v_key = f"{prefix}.self_attn.v_proj.weight"
        if v_key in weights:
            v_weight = weights[v_key].astype(np.float32)
            for head in range(NUM_KV_HEADS):
                head_start = head * HEAD_DIM
                for dim in range(HEAD_DIM):
                    row_idx = head_start + dim
                    row = v_weight[row_idx, :]
                    abs_row = np.abs(row)
                    dims.append({
                        "tensor_id": f"L{layer_idx}.attn.v",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": "v",
                        "head_kind": "kv_head",
                        "head": head,
                        "dim": dim,
                        "row_l2": float(np.linalg.norm(row)),
                        "row_mean_abs": float(np.mean(abs_row)),
                        "row_std": float(np.std(row)),
                        "row_p95_abs": float(np.percentile(abs_row, 95)),
                        "row_zero_frac": float(np.mean(row == 0)),
                    })
        
        # MLP down_proj dims (2048 dims)
        down_key = f"{prefix}.mlp.down_proj.weight"
        if down_key in weights:
            down_weight = weights[down_key].astype(np.float32)
            for dim in range(HIDDEN_SIZE):
                row = down_weight[dim, :]
                abs_row = np.abs(row)
                dims.append({
                    "tensor_id": f"L{layer_idx}.mlp.down",
                    "layer": layer_idx,
                    "module": "mlp",
                    "role": "down",
                    "head_kind": "none",
                    "head": None,
                    "dim": dim,
                    "row_l2": float(np.linalg.norm(row)),
                    "row_mean_abs": float(np.mean(abs_row)),
                    "row_std": float(np.std(row)),
                    "row_p95_abs": float(np.percentile(abs_row, 95)),
                    "row_zero_frac": float(np.mean(row == 0)),
                })
        
        # MLP up_proj dims (11008 dims)
        up_key = f"{prefix}.mlp.up_proj.weight"
        if up_key in weights:
            up_weight = weights[up_key].astype(np.float32)
            for dim in range(INTERMEDIATE_SIZE):
                row = up_weight[dim, :]
                abs_row = np.abs(row)
                dims.append({
                    "tensor_id": f"L{layer_idx}.mlp.up",
                    "layer": layer_idx,
                    "module": "mlp",
                    "role": "up",
                    "head_kind": "none",
                    "head": None,
                    "dim": dim,
                    "row_l2": float(np.linalg.norm(row)),
                    "row_mean_abs": float(np.mean(abs_row)),
                    "row_std": float(np.std(row)),
                    "row_p95_abs": float(np.percentile(abs_row, 95)),
                    "row_zero_frac": float(np.mean(row == 0)),
                })
        
        # MLP gate_proj dims (11008 dims)
        gate_key = f"{prefix}.mlp.gate_proj.weight"
        if gate_key in weights:
            gate_weight = weights[gate_key].astype(np.float32)
            for dim in range(INTERMEDIATE_SIZE):
                row = gate_weight[dim, :]
                abs_row = np.abs(row)
                dims.append({
                    "tensor_id": f"L{layer_idx}.mlp.gate",
                    "layer": layer_idx,
                    "module": "mlp",
                    "role": "gate",
                    "head_kind": "none",
                    "head": None,
                    "dim": dim,
                    "row_l2": float(np.linalg.norm(row)),
                    "row_mean_abs": float(np.mean(abs_row)),
                    "row_std": float(np.std(row)),
                    "row_p95_abs": float(np.percentile(abs_row, 95)),
                    "row_zero_frac": float(np.mean(row == 0)),
                })
        
        if (layer_idx + 1) % 6 == 0:
            print(f"    Layer {layer_idx + 1}/{NUM_LAYERS} complete...")
    
    df = pd.DataFrame(dims)
    df["layer"] = df["layer"].astype("int16")
    df["head"] = df["head"].astype("Int16")
    df["dim"] = df["dim"].astype("int32")
    for col in ["row_l2", "row_mean_abs", "row_std", "row_p95_abs", "row_zero_frac"]:
        df[col] = df[col].astype("float32")
    
    return df


# =============================================================================
# 4. tensor_blocks.parquet - Semantic block decomposition (~23k rows)
# =============================================================================

def compute_gini(arr: np.ndarray) -> float:
    """Compute Gini coefficient of an array."""
    arr = np.abs(arr.flatten())
    if len(arr) == 0 or arr.sum() == 0:
        return 0.0
    arr = np.sort(arr)
    n = len(arr)
    index = np.arange(1, n + 1)
    return float((np.sum((2 * index - n - 1) * arr)) / (n * np.sum(arr)))


def create_tensor_blocks(weights: Dict[str, np.ndarray]) -> pd.DataFrame:
    """Create tensor_blocks.parquet with semantic block decomposition."""
    blocks = []
    
    for layer_idx in range(NUM_LAYERS):
        prefix = f"model.layers.{layer_idx}"
        
        # Q blocks: (q_head 0..15, in_block 0..15)
        q_key = f"{prefix}.self_attn.q_proj.weight"
        if q_key in weights:
            q_weight = weights[q_key].astype(np.float32)
            for head in range(NUM_HEADS):
                out_start = head * HEAD_DIM
                out_end = (head + 1) * HEAD_DIM
                for in_block in range(N_IN_BLOCKS):
                    in_start = in_block * BLOCK_DIM
                    in_end = (in_block + 1) * BLOCK_DIM
                    block = q_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    
                    # Row and column Gini
                    row_norms = np.linalg.norm(block, axis=1)
                    col_norms = np.linalg.norm(block, axis=0)
                    
                    blocks.append({
                        "tensor_id": f"L{layer_idx}.attn.q",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": "q",
                        "head_kind": "q_head",
                        "head": head,
                        "out_block": None,
                        "in_block": in_block,
                        "out_start": out_start,
                        "out_end": out_end,
                        "in_start": in_start,
                        "in_end": in_end,
                        "fro_norm": float(np.linalg.norm(flat)),
                        "mean_abs": float(np.mean(abs_flat)),
                        "std": float(np.std(flat)),
                        "p95_abs": float(np.percentile(abs_flat, 95)),
                        "row_gini": compute_gini(row_norms),
                        "col_gini": compute_gini(col_norms),
                    })
        
        # K blocks: (kv_head 0..3, in_block 0..15)
        k_key = f"{prefix}.self_attn.k_proj.weight"
        if k_key in weights:
            k_weight = weights[k_key].astype(np.float32)
            for head in range(NUM_KV_HEADS):
                out_start = head * HEAD_DIM
                out_end = (head + 1) * HEAD_DIM
                for in_block in range(N_IN_BLOCKS):
                    in_start = in_block * BLOCK_DIM
                    in_end = (in_block + 1) * BLOCK_DIM
                    block = k_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    row_norms = np.linalg.norm(block, axis=1)
                    col_norms = np.linalg.norm(block, axis=0)
                    
                    blocks.append({
                        "tensor_id": f"L{layer_idx}.attn.k",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": "k",
                        "head_kind": "kv_head",
                        "head": head,
                        "out_block": None,
                        "in_block": in_block,
                        "out_start": out_start,
                        "out_end": out_end,
                        "in_start": in_start,
                        "in_end": in_end,
                        "fro_norm": float(np.linalg.norm(flat)),
                        "mean_abs": float(np.mean(abs_flat)),
                        "std": float(np.std(flat)),
                        "p95_abs": float(np.percentile(abs_flat, 95)),
                        "row_gini": compute_gini(row_norms),
                        "col_gini": compute_gini(col_norms),
                    })
        
        # V blocks: (kv_head 0..3, in_block 0..15)
        v_key = f"{prefix}.self_attn.v_proj.weight"
        if v_key in weights:
            v_weight = weights[v_key].astype(np.float32)
            for head in range(NUM_KV_HEADS):
                out_start = head * HEAD_DIM
                out_end = (head + 1) * HEAD_DIM
                for in_block in range(N_IN_BLOCKS):
                    in_start = in_block * BLOCK_DIM
                    in_end = (in_block + 1) * BLOCK_DIM
                    block = v_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    row_norms = np.linalg.norm(block, axis=1)
                    col_norms = np.linalg.norm(block, axis=0)
                    
                    blocks.append({
                        "tensor_id": f"L{layer_idx}.attn.v",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": "v",
                        "head_kind": "kv_head",
                        "head": head,
                        "out_block": None,
                        "in_block": in_block,
                        "out_start": out_start,
                        "out_end": out_end,
                        "in_start": in_start,
                        "in_end": in_end,
                        "fro_norm": float(np.linalg.norm(flat)),
                        "mean_abs": float(np.mean(abs_flat)),
                        "std": float(np.std(flat)),
                        "p95_abs": float(np.percentile(abs_flat, 95)),
                        "row_gini": compute_gini(row_norms),
                        "col_gini": compute_gini(col_norms),
                    })
        
        # O blocks: (out_block 0..15, in_block 0..15) where in_block = head chunk
        o_key = f"{prefix}.self_attn.o_proj.weight"
        if o_key in weights:
            o_weight = weights[o_key].astype(np.float32)
            for out_block in range(N_IN_BLOCKS):
                out_start = out_block * BLOCK_DIM
                out_end = (out_block + 1) * BLOCK_DIM
                for in_block in range(NUM_HEADS):  # in_block = head chunk
                    in_start = in_block * HEAD_DIM
                    in_end = (in_block + 1) * HEAD_DIM
                    block = o_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    row_norms = np.linalg.norm(block, axis=1)
                    col_norms = np.linalg.norm(block, axis=0)
                    
                    blocks.append({
                        "tensor_id": f"L{layer_idx}.attn.o",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": "o",
                        "head_kind": "none",
                        "head": None,
                        "out_block": out_block,
                        "in_block": in_block,
                        "out_start": out_start,
                        "out_end": out_end,
                        "in_start": in_start,
                        "in_end": in_end,
                        "fro_norm": float(np.linalg.norm(flat)),
                        "mean_abs": float(np.mean(abs_flat)),
                        "std": float(np.std(flat)),
                        "p95_abs": float(np.percentile(abs_flat, 95)),
                        "row_gini": compute_gini(row_norms),
                        "col_gini": compute_gini(col_norms),
                    })
    
    df = pd.DataFrame(blocks)
    df["layer"] = df["layer"].astype("int16")
    df["head"] = df["head"].astype("Int16")
    df["out_block"] = df["out_block"].astype("Int16")
    df["in_block"] = df["in_block"].astype("int16")
    df["out_start"] = df["out_start"].astype("int32")
    df["out_end"] = df["out_end"].astype("int32")
    df["in_start"] = df["in_start"].astype("int32")
    df["in_end"] = df["in_end"].astype("int32")
    for col in ["fro_norm", "mean_abs", "std", "p95_abs", "row_gini", "col_gini"]:
        df[col] = df[col].astype("float32")
    
    return df


# =============================================================================
# 5. tensor_block_topk.parquet - Sparse weight anchors (~370k rows at k=32)
# =============================================================================

def create_tensor_block_topk(weights: Dict[str, np.ndarray], k: int = 32) -> pd.DataFrame:
    """Create tensor_block_topk.parquet with top-k weight values per block."""
    topk_rows = []
    
    for layer_idx in range(NUM_LAYERS):
        prefix = f"model.layers.{layer_idx}"
        
        # Q top-k
        q_key = f"{prefix}.self_attn.q_proj.weight"
        if q_key in weights:
            q_weight = weights[q_key].astype(np.float32)
            for head in range(NUM_HEADS):
                out_start = head * HEAD_DIM
                out_end = (head + 1) * HEAD_DIM
                for in_block in range(N_IN_BLOCKS):
                    in_start = in_block * BLOCK_DIM
                    in_end = (in_block + 1) * BLOCK_DIM
                    block = q_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    
                    # Get top-k indices by absolute value
                    topk_idx = np.argpartition(abs_flat, -k)[-k:]
                    topk_idx = topk_idx[np.argsort(abs_flat[topk_idx])[::-1]]
                    
                    row_indices = (topk_idx // block.shape[1]).tolist()
                    col_indices = (topk_idx % block.shape[1]).tolist()
                    values = flat[topk_idx].tolist()
                    
                    topk_rows.append({
                        "tensor_id": f"L{layer_idx}.attn.q",
                        "layer": layer_idx,
                        "role": "q",
                        "head": head,
                        "out_block": None,
                        "in_block": in_block,
                        "k": k,
                        "row_idx": row_indices,
                        "col_idx": col_indices,
                        "value": values,
                    })
        
        # K top-k
        k_key = f"{prefix}.self_attn.k_proj.weight"
        if k_key in weights:
            k_weight = weights[k_key].astype(np.float32)
            for head in range(NUM_KV_HEADS):
                out_start = head * HEAD_DIM
                out_end = (head + 1) * HEAD_DIM
                for in_block in range(N_IN_BLOCKS):
                    in_start = in_block * BLOCK_DIM
                    in_end = (in_block + 1) * BLOCK_DIM
                    block = k_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    
                    topk_idx = np.argpartition(abs_flat, -k)[-k:]
                    topk_idx = topk_idx[np.argsort(abs_flat[topk_idx])[::-1]]
                    
                    row_indices = (topk_idx // block.shape[1]).tolist()
                    col_indices = (topk_idx % block.shape[1]).tolist()
                    values = flat[topk_idx].tolist()
                    
                    topk_rows.append({
                        "tensor_id": f"L{layer_idx}.attn.k",
                        "layer": layer_idx,
                        "role": "k",
                        "head": head,
                        "out_block": None,
                        "in_block": in_block,
                        "k": k,
                        "row_idx": row_indices,
                        "col_idx": col_indices,
                        "value": values,
                    })
        
        # V top-k
        v_key = f"{prefix}.self_attn.v_proj.weight"
        if v_key in weights:
            v_weight = weights[v_key].astype(np.float32)
            for head in range(NUM_KV_HEADS):
                out_start = head * HEAD_DIM
                out_end = (head + 1) * HEAD_DIM
                for in_block in range(N_IN_BLOCKS):
                    in_start = in_block * BLOCK_DIM
                    in_end = (in_block + 1) * BLOCK_DIM
                    block = v_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    
                    topk_idx = np.argpartition(abs_flat, -k)[-k:]
                    topk_idx = topk_idx[np.argsort(abs_flat[topk_idx])[::-1]]
                    
                    row_indices = (topk_idx // block.shape[1]).tolist()
                    col_indices = (topk_idx % block.shape[1]).tolist()
                    values = flat[topk_idx].tolist()
                    
                    topk_rows.append({
                        "tensor_id": f"L{layer_idx}.attn.v",
                        "layer": layer_idx,
                        "role": "v",
                        "head": head,
                        "out_block": None,
                        "in_block": in_block,
                        "k": k,
                        "row_idx": row_indices,
                        "col_idx": col_indices,
                        "value": values,
                    })
        
        # O top-k
        o_key = f"{prefix}.self_attn.o_proj.weight"
        if o_key in weights:
            o_weight = weights[o_key].astype(np.float32)
            for out_block in range(N_IN_BLOCKS):
                out_start = out_block * BLOCK_DIM
                out_end = (out_block + 1) * BLOCK_DIM
                for in_block in range(NUM_HEADS):
                    in_start = in_block * HEAD_DIM
                    in_end = (in_block + 1) * HEAD_DIM
                    block = o_weight[out_start:out_end, in_start:in_end]
                    flat = block.flatten()
                    abs_flat = np.abs(flat)
                    
                    topk_idx = np.argpartition(abs_flat, -k)[-k:]
                    topk_idx = topk_idx[np.argsort(abs_flat[topk_idx])[::-1]]
                    
                    row_indices = (topk_idx // block.shape[1]).tolist()
                    col_indices = (topk_idx % block.shape[1]).tolist()
                    values = flat[topk_idx].tolist()
                    
                    topk_rows.append({
                        "tensor_id": f"L{layer_idx}.attn.o",
                        "layer": layer_idx,
                        "role": "o",
                        "head": None,
                        "out_block": out_block,
                        "in_block": in_block,
                        "k": k,
                        "row_idx": row_indices,
                        "col_idx": col_indices,
                        "value": values,
                    })
    
    df = pd.DataFrame(topk_rows)
    df["layer"] = df["layer"].astype("int16")
    df["head"] = df["head"].astype("Int16")
    df["out_block"] = df["out_block"].astype("Int16")
    df["in_block"] = df["in_block"].astype("int16")
    df["k"] = df["k"].astype("int16")
    
    return df


# =============================================================================
# 6. tensor_relations.parquet - Semantic relations (~1k rows)
# =============================================================================

def create_tensor_relations() -> pd.DataFrame:
    """Create tensor_relations.parquet with semantic relationships."""
    relations = []
    
    # Tied embeddings
    relations.append({
        "src_tensor_id": "lm_head",
        "dst_tensor_id": "embed_tokens",
        "relation": "tied_to",
        "layer": None,
        "note": "LM head shares weights with input embeddings",
    })
    
    # Per-layer relations
    for layer_idx in range(NUM_LAYERS):
        # Input norm feeds into Q/K/V
        for proj in ["q", "k", "v"]:
            relations.append({
                "src_tensor_id": f"L{layer_idx}.norm.input_norm",
                "dst_tensor_id": f"L{layer_idx}.attn.{proj}",
                "relation": "feeds_into",
                "layer": layer_idx,
                "note": None,
            })
        
        # Q/K/V project to attention operation
        for proj in ["q", "k", "v"]:
            relations.append({
                "src_tensor_id": f"L{layer_idx}.attn.{proj}",
                "dst_tensor_id": f"L{layer_idx}.attn.o",
                "relation": "projects_to",
                "layer": layer_idx,
                "note": f"{proj.upper()} to O projection",
            })
        
        # O adds to residual
        relations.append({
            "src_tensor_id": f"L{layer_idx}.attn.o",
            "dst_tensor_id": f"L{layer_idx}.norm.post_norm",
            "relation": "residual_adds_to",
            "layer": layer_idx,
            "note": "Attention output to post-attention norm",
        })
        
        # Post-norm feeds into MLP
        for proj in ["gate", "up"]:
            relations.append({
                "src_tensor_id": f"L{layer_idx}.norm.post_norm",
                "dst_tensor_id": f"L{layer_idx}.mlp.{proj}",
                "relation": "feeds_into",
                "layer": layer_idx,
                "note": None,
            })
        
        # Gate/Up to Down
        for proj in ["gate", "up"]:
            relations.append({
                "src_tensor_id": f"L{layer_idx}.mlp.{proj}",
                "dst_tensor_id": f"L{layer_idx}.mlp.down",
                "relation": "projects_to",
                "layer": layer_idx,
                "note": f"{proj} to down projection",
            })
        
        # GQA sharing: Q heads share KV
        heads_per_kv = NUM_HEADS // NUM_KV_HEADS
        for q_head in range(NUM_HEADS):
            kv_head = q_head // heads_per_kv
            relations.append({
                "src_tensor_id": f"L{layer_idx}.attn.q",
                "dst_tensor_id": f"L{layer_idx}.attn.k",
                "relation": "shares_kv",
                "layer": layer_idx,
                "note": f"Q head {q_head} shares KV head {kv_head}",
            })
    
    df = pd.DataFrame(relations)
    df["layer"] = df["layer"].astype("Int16")
    
    return df


# =============================================================================
# Main
# =============================================================================

def save_parquet(df: pd.DataFrame, filename: str) -> None:
    """Save DataFrame to Parquet file."""
    filepath = OUTPUT_DIR / filename
    df.to_parquet(filepath, index=False, compression="snappy")
    print(f"  Saved {filename}: {len(df):,} rows, {filepath.stat().st_size / 1024:.1f} KB")


def main():
    """Main extraction pipeline."""
    print("=" * 60)
    print("SmolLM3-3B Semantic Weight Extraction")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load weights
    print("\n1. Loading model from HuggingFace...")
    weights, config_dict = load_model_weights()
    initialize_config(config_dict)
    print(f"   Config: {NUM_LAYERS} layers, {HIDDEN_SIZE} hidden, {NUM_HEADS} Q heads, {NUM_KV_HEADS} KV heads")
    
    # Create all tables
    print("\n2. Creating Parquet files...")
    
    print("\n   [1/6] tensors.parquet")
    tensors_df = create_tensors(weights, config_dict)
    save_parquet(tensors_df, "tensors.parquet")
    
    print("\n   [2/6] tensor_stats.parquet")
    tensor_stats_df = create_tensor_stats(weights, tensors_df)
    save_parquet(tensor_stats_df, "tensor_stats.parquet")
    
    print("\n   [3/6] tensor_dims.parquet (~976k rows)")
    tensor_dims_df = create_tensor_dims(weights)
    save_parquet(tensor_dims_df, "tensor_dims.parquet")
    
    print("\n   [4/6] tensor_blocks.parquet")
    tensor_blocks_df = create_tensor_blocks(weights)
    save_parquet(tensor_blocks_df, "tensor_blocks.parquet")
    
    print("\n   [5/6] tensor_block_topk.parquet")
    tensor_block_topk_df = create_tensor_block_topk(weights, k=32)
    save_parquet(tensor_block_topk_df, "tensor_block_topk.parquet")
    
    print("\n   [6/6] tensor_relations.parquet")
    tensor_relations_df = create_tensor_relations()
    save_parquet(tensor_relations_df, "tensor_relations.parquet")
    
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
    print(f"  - tensors: {len(tensors_df):,}")
    print(f"  - tensor_stats: {len(tensor_stats_df):,}")
    print(f"  - tensor_dims: {len(tensor_dims_df):,}")
    print(f"  - tensor_blocks: {len(tensor_blocks_df):,}")
    print(f"  - tensor_block_topk: {len(tensor_block_topk_df):,}")
    print(f"  - tensor_relations: {len(tensor_relations_df):,}")


if __name__ == "__main__":
    main()
