#!/usr/bin/env python3
"""
Extract SmolLM3-3B model architecture and weight statistics to Parquet files.

Generates 2 consolidated Parquet files in public/data/llm/:
    1. model_structure.parquet - Combined tensor catalog + stats + relations (~327 rows)
    2. raw_weights.parquet     - Raw weight values, chunked by rows (~millions of rows, ~GB)

Usage:
    pip install transformers torch pyarrow pandas numpy
    python public/scripts/extract_smollm.py
"""

from pathlib import Path
from typing import Dict, Any, Optional, Tuple
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
    global INTERMEDIATE_SIZE, HEAD_DIM, VOCAB_SIZE
    
    NUM_LAYERS = config_dict["num_hidden_layers"]
    NUM_HEADS = config_dict["num_attention_heads"]
    NUM_KV_HEADS = config_dict["num_key_value_heads"]
    HIDDEN_SIZE = config_dict["hidden_size"]
    INTERMEDIATE_SIZE = config_dict["intermediate_size"]
    HEAD_DIM = HIDDEN_SIZE // NUM_HEADS
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
    """Create tensor_stats.parquet with whole-tensor statistics."""
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
# 3. model_structure.parquet - Combined tensor catalog + stats + relations
# =============================================================================

def create_model_structure(weights: Dict[str, np.ndarray], tensors_df: pd.DataFrame, 
                          tensor_stats_df: pd.DataFrame) -> pd.DataFrame:
    """Create model_structure.parquet combining tensors + stats + relations."""
    # Start with tensors
    structure = tensors_df.copy()
    
    # Merge in stats
    stats_map = {row["tensor_id"]: row for _, row in tensor_stats_df.iterrows()}
    for idx, row in structure.iterrows():
        tensor_id = row["tensor_id"]
        if tensor_id in stats_map:
            stats = stats_map[tensor_id]
            structure.at[idx, "fro_norm"] = stats["fro_norm"]
            structure.at[idx, "mean_abs"] = stats["mean_abs"]
            structure.at[idx, "std"] = stats["std"]
            structure.at[idx, "p95_abs"] = stats["p95_abs"]
            structure.at[idx, "p99_abs"] = stats["p99_abs"]
            structure.at[idx, "zero_frac"] = stats["zero_frac"]
            structure.at[idx, "min"] = stats["min"]
            structure.at[idx, "max"] = stats["max"]
        else:
            # Fill with None for tied tensors
            for col in ["fro_norm", "mean_abs", "std", "p95_abs", "p99_abs", "zero_frac", "min", "max"]:
                structure.at[idx, col] = None
    
    # Add parent_id column for relations
    structure["parent_id"] = None
    
    # Add relations as parent_id references
    # Tied embeddings
    lm_head_idx = structure[structure["tensor_id"] == "lm_head"].index
    if len(lm_head_idx) > 0:
        structure.at[lm_head_idx[0], "parent_id"] = "embed_tokens"
    
    # Per-layer relations - set parent_id for components
    for layer_idx in range(NUM_LAYERS):
        # Q/K/V have input_norm as parent
        for proj in ["q", "k", "v"]:
            tensor_id = f"L{layer_idx}.attn.{proj}"
            idx = structure[structure["tensor_id"] == tensor_id].index
            if len(idx) > 0:
                structure.at[idx[0], "parent_id"] = f"L{layer_idx}.norm.input_norm"
        
        # O has attention operation as parent (use Q as representative)
        tensor_id = f"L{layer_idx}.attn.o"
        idx = structure[structure["tensor_id"] == tensor_id].index
        if len(idx) > 0:
            structure.at[idx[0], "parent_id"] = f"L{layer_idx}.attn.q"
        
        # MLP gate/up have post_norm as parent
        for proj in ["gate", "up"]:
            tensor_id = f"L{layer_idx}.mlp.{proj}"
            idx = structure[structure["tensor_id"] == tensor_id].index
            if len(idx) > 0:
                structure.at[idx[0], "parent_id"] = f"L{layer_idx}.norm.post_norm"
        
        # MLP down has gate/up as parent (use gate as representative)
        tensor_id = f"L{layer_idx}.mlp.down"
        idx = structure[structure["tensor_id"] == tensor_id].index
        if len(idx) > 0:
            structure.at[idx[0], "parent_id"] = f"L{layer_idx}.mlp.gate"
    
    return structure


# =============================================================================
# 4. raw_weights.parquet - Raw weight values, row-by-row
# =============================================================================

def create_raw_weights_split(weights: Dict[str, np.ndarray]) -> pd.DataFrame:
    """Create split raw_weights files by layer and role for on-demand loading."""
    print("  Storing raw weight values split by layer and role...")
    print("  This creates smaller files that can be loaded on-demand...")
    
    # Define schema
    schema = pa.schema([
        ("tensor_id", pa.string()),
        ("layer", pa.int16()),
        ("module", pa.string()),
        ("role", pa.string()),
        ("row_idx", pa.int32()),
        ("col_start", pa.int32()),
        ("col_end", pa.int32()),
        ("values", pa.list_(pa.float32())),
    ])
    
    chunk_size = 10000  # Write in chunks of 10k rows
    total_rows = 0
    files_created = []
    
    def write_file(data: list[dict], layer: int, role: str):
        """Write a single file for a specific layer and role."""
        if not data:
            return
        filename = f"raw_weights_l{layer}_{role}.parquet"
        filepath = OUTPUT_DIR / filename
        
        df = pd.DataFrame(data)
        df["layer"] = df["layer"].replace({None: -1}).astype("int16")
        table = pa.Table.from_pandas(df, schema=schema)
        
        with pq.ParquetWriter(filepath, schema, compression='snappy') as writer:
            writer.write_table(table)
        
        file_size_mb = filepath.stat().st_size / 1024 / 1024
        files_created.append((filename, len(data), file_size_mb))
        return len(data)
    
    # Process layers - split by layer and role
    for layer_idx in range(NUM_LAYERS):
        if layer_idx % 5 == 0:
            print(f"    Processing layer {layer_idx}/{NUM_LAYERS}...")
        
        prefix = f"model.layers.{layer_idx}"
        
        # Attention projections: Q, K, V, O
        for proj in ["q", "k", "v", "o"]:
            key = f"{prefix}.self_attn.{proj}_proj.weight"
            if key in weights:
                weight_matrix = weights[key].astype(np.float32)
                num_rows, num_cols = weight_matrix.shape
                
                current_chunk = []
                for row_idx in range(num_rows):
                    current_chunk.append({
                        "tensor_id": f"L{layer_idx}.attn.{proj}",
                        "layer": layer_idx,
                        "module": "attn",
                        "role": proj,
                        "row_idx": row_idx,
                        "col_start": 0,
                        "col_end": num_cols,
                        "values": weight_matrix[row_idx, :].tolist(),
                    })
                
                rows_written = write_file(current_chunk, layer_idx, proj)
                total_rows += rows_written
        
        # MLP projections: gate, up, down
        for proj in ["gate", "up", "down"]:
            key = f"{prefix}.mlp.{proj}_proj.weight"
            if key in weights:
                weight_matrix = weights[key].astype(np.float32)
                num_rows, num_cols = weight_matrix.shape
                
                current_chunk = []
                for row_idx in range(num_rows):
                    current_chunk.append({
                        "tensor_id": f"L{layer_idx}.mlp.{proj}",
                        "layer": layer_idx,
                        "module": "mlp",
                        "role": proj,
                        "row_idx": row_idx,
                        "col_start": 0,
                        "col_end": num_cols,
                        "values": weight_matrix[row_idx, :].tolist(),
                    })
                
                rows_written = write_file(current_chunk, layer_idx, proj)
                total_rows += rows_written
    
    # Global tensors (layer=-1)
    if "model.embed_tokens.weight" in weights:
        embed_matrix = weights["model.embed_tokens.weight"].astype(np.float32)
        num_rows, num_cols = embed_matrix.shape
        print(f"    Processing embedding ({num_rows:,} rows)...")
        current_chunk = []
        for row_idx in range(num_rows):
            current_chunk.append({
                "tensor_id": "embed_tokens",
                "layer": -1,
                "module": "embed",
                "role": "embed_tokens",
                "row_idx": row_idx,
                "col_start": 0,
                "col_end": num_cols,
                "values": embed_matrix[row_idx, :].tolist(),
            })
        rows_written = write_file(current_chunk, -1, "embed_tokens")
        total_rows += rows_written
    
    # Final norm (layer=-1)
    for key in ["model.norm.weight", "model.layer_norm.weight"]:
        if key in weights:
            norm_vec = weights[key].astype(np.float32).flatten()
            current_chunk = [{
                "tensor_id": "final_norm",
                "layer": -1,
                "module": "norm",
                "role": "final_norm",
                "row_idx": 0,
                "col_start": 0,
                "col_end": len(norm_vec),
                "values": norm_vec.tolist(),
            }]
            rows_written = write_file(current_chunk, -1, "final_norm")
            total_rows += rows_written
            break
    
    # Layer norms
    for layer_idx in range(NUM_LAYERS):
        prefix = f"model.layers.{layer_idx}"
        for norm_name, role in [("input_layernorm", "input_norm"), ("post_attention_layernorm", "post_norm")]:
            key = f"{prefix}.{norm_name}.weight"
            if key in weights:
                norm_vec = weights[key].astype(np.float32).flatten()
                current_chunk = [{
                    "tensor_id": f"L{layer_idx}.norm.{role}",
                    "layer": layer_idx,
                    "module": "norm",
                    "role": role,
                    "row_idx": 0,
                    "col_start": 0,
                    "col_end": len(norm_vec),
                    "values": norm_vec.tolist(),
                }]
                rows_written = write_file(current_chunk, layer_idx, role)
                total_rows += rows_written
    
    print(f"    Completed: {total_rows:,} rows written across {len(files_created)} files")
    total_size_mb = sum(f[2] for f in files_created)
    print(f"    Total size: {total_size_mb:.1f} MB")
    print(f"    Average file size: {total_size_mb / len(files_created):.2f} MB per file")
    
    # Return summary
    return pd.DataFrame([{"total_rows": total_rows, "total_files": len(files_created), "total_size_mb": total_size_mb}])


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
    
    print("\n   [1/2] model_structure.parquet (consolidated)")
    tensors_df = create_tensors(weights, config_dict)
    tensor_stats_df = create_tensor_stats(weights, tensors_df)
    model_structure_df = create_model_structure(weights, tensors_df, tensor_stats_df)
    save_parquet(model_structure_df, "model_structure.parquet")
    
    print("\n   [2/2] raw_weights_*.parquet (split by layer and role)")
    print("  Creating smaller files for on-demand loading...")
    raw_weights_df = create_raw_weights_split(weights)
    
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
        if size > 1024 * 1024:
            print(f"  - {f.name}: {size / 1024 / 1024:.1f} MB")
        else:
            print(f"  - {f.name}: {size / 1024:.1f} KB")
    print(f"\nTotal size: {total_size / 1024 / 1024:.1f} MB")
    
    print(f"\nRow counts:")
    print(f"  - model_structure: {len(model_structure_df):,}")
    if "total_rows" in raw_weights_df.columns:
        print(f"  - raw_weights: {raw_weights_df.iloc[0]['total_rows']:,.0f} rows (storing full weight matrices)")


if __name__ == "__main__":
    main()
