#!/usr/bin/env python3
"""
Process OpenTelemetry trace data and generate UI-ready JSON files.

Usage: 
    python public/scripts/process_traces.py

This script processes raw OpenTelemetry traces from public/data/trace.json
and generates optimized JSON files for the trace visualization blog post.

The script filters to leaf spans (spans with no children) for time bucketing
to avoid double-counting long-running parent spans and to show actual work
rather than orchestration overhead.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import defaultdict

# File paths
INPUT_FILE = Path("public/data/trace.json")
OUTPUT_DIR = Path("public/data")

def flatten_spans(span: Dict, flat_list: List[Dict]) -> None:
    """Recursively flatten nested child_spans structure."""
    flat_list.append(span)
    for child in span.get('child_spans', []):
        flatten_spans(child, flat_list)

def load_traces() -> Dict:
    """Load and parse the first trace from the trace.json file."""
    with open(INPUT_FILE, 'r') as f:
        traces = json.load(f)
    
    # Get first trace and parse the nested JSON string
    first_trace_wrapper = traces[0]
    trace = json.loads(first_trace_wrapper['trace'])
    
    # Flatten nested child_spans structure
    flat_spans = []
    for root_span in trace['spans']:
        flatten_spans(root_span, flat_spans)
    
    trace['spans'] = flat_spans
    return trace

def parse_iso_timestamp(ts_str: str) -> float:
    """Parse ISO timestamp to Unix timestamp in seconds."""
    dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
    return dt.timestamp()

def parse_iso_duration(duration_str: str) -> float:
    """Parse ISO 8601 duration string (e.g., 'PT1M37.311336S') to seconds."""
    if not duration_str:
        return 0.0
    
    # Pattern: PT[hours]H[minutes]M[seconds]S
    pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?'
    match = re.match(pattern, duration_str)
    
    if not match:
        return 0.0
    
    hours = float(match.group(1) or 0)
    minutes = float(match.group(2) or 0)
    seconds = float(match.group(3) or 0)
    
    return hours * 3600 + minutes * 60 + seconds

def calculate_duration(span: Dict) -> float:
    """Calculate span duration in seconds."""
    duration = span.get('duration', 0)
    
    if isinstance(duration, str):
        return parse_iso_duration(duration)
    elif isinstance(duration, (int, float)):
        # If numeric, assume microseconds
        return duration / 1_000_000.0
    
    return 0.0

def calculate_metrics(trace: Dict) -> Dict:
    """Calculate trace-level metrics."""
    spans = trace['spans']
    
    # Calculate actual elapsed time (not sum of durations, which counts overlaps)
    if spans:
        span_starts = []
        span_ends = []
        for span in spans:
            start = parse_iso_timestamp(span['timestamp'])
            duration = calculate_duration(span)
            span_starts.append(start)
            span_ends.append(start + duration)
        
        elapsed_time = max(span_ends) - min(span_starts)
    else:
        elapsed_time = 0.0
    
    # Also calculate sum of all durations for reference
    sum_of_durations = 0.0
    step_count = 0
    llm_call_count = 0
    total_tokens = 0
    durations = []
    
    for span in spans:
        duration = calculate_duration(span)
        sum_of_durations += duration
        
        span_type = span.get('span_attributes', {}).get('openinference.span.kind', 'INTERNAL')
        
        if span_type == 'CHAIN':
            step_count += 1
            durations.append(duration)
        elif span_type == 'LLM':
            llm_call_count += 1
            tokens = span.get('span_attributes', {}).get('llm.token_count.total', 0)
            if tokens:
                if isinstance(tokens, str):
                    tokens = int(tokens)
                total_tokens += tokens
    
    avg_step_duration = sum(durations) / len(durations) if durations else 0.0
    
    # Calculate max nesting depth (will be done in hierarchy building)
    max_nesting_depth = 0
    
    return {
        'total_duration': elapsed_time,  # Actual elapsed time
        'sum_of_durations': sum_of_durations,  # Sum including overlaps
        'step_count': step_count,
        'llm_call_count': llm_call_count,
        'total_tokens': total_tokens,
        'avg_step_duration': avg_step_duration,
        'max_nesting_depth': max_nesting_depth,  # Will update after hierarchy
        'trace_id': trace['trace_id'],
        'total_spans': len(spans)
    }

def build_span_hierarchy(trace: Dict) -> tuple[List[Dict], Dict, int]:
    """Build span hierarchy and calculate levels."""
    spans = trace['spans']
    
    # Create lookup by span_id
    span_map = {}
    for span in spans:
        span_id = span['span_id']
        span_map[span_id] = {
            'span_id': span_id,
            'parent_id': span.get('parent_span_id'),
            'name': span['span_name'],
            'type': span.get('span_attributes', {}).get('openinference.span.kind', 'INTERNAL'),
            'start': parse_iso_timestamp(span['timestamp']),
            'duration': calculate_duration(span),
            'tokens': span.get('span_attributes', {}).get('llm.token_count.total'),
            'attributes': span.get('span_attributes', {}),
            'children': [],
            'level': 0,
            'parent_name': None
        }
    
    # Build tree structure
    roots = []
    for span_id, span_data in span_map.items():
        parent_id = span_data['parent_id']
        if parent_id and parent_id in span_map:
            span_map[parent_id]['children'].append(span_data)
            span_data['parent_name'] = span_map[parent_id]['name']
        else:
            roots.append(span_data)
    
    # Calculate levels
    max_depth = 0
    def assign_levels(node: Dict, level: int = 0):
        nonlocal max_depth
        node['level'] = level
        max_depth = max(max_depth, level)
        for child in node['children']:
            assign_levels(child, level + 1)
    
    for root in roots:
        assign_levels(root)
    
    # Add has_children and child_count
    for span_data in span_map.values():
        span_data['has_children'] = len(span_data['children']) > 0
        span_data['child_count'] = len(span_data['children'])
    
    # Flatten to list
    flat_spans = list(span_map.values())
    
    # Build tree structure for output
    tree = {
        'roots': roots,
        'span_map': {sid: {k: v for k, v in s.items() if k != 'children'} for sid, s in span_map.items()}
    }
    
    return flat_spans, tree, max_depth

def extract_react_features(flat_spans: List[Dict]) -> Dict[str, Dict]:
    """Extract ReAct pattern features from CHAIN spans."""
    react_features = {}
    
    for span in flat_spans:
        if span['type'] != 'CHAIN':
            continue
        
        # Look for LLM child spans
        llm_children = [s for s in flat_spans if s['parent_id'] == span['span_id'] and s['type'] == 'LLM']
        
        has_thought = False
        has_code = False
        has_tool_call = False
        message_count = 0
        
        if llm_children:
            llm_span = llm_children[0]
            output = llm_span['attributes'].get('llm.output_messages.0.message.content', '')
            
            has_thought = 'Thought:' in output
            has_code = 'Code:' in output or '```py' in output
            
            # Count input messages
            attrs = llm_span['attributes']
            message_keys = [k for k in attrs.keys() if k.startswith('llm.input_messages.')]
            message_count = len(set(k.split('.')[2] for k in message_keys if len(k.split('.')) > 2))
            
            # Check for tool calls
            has_tool_call = any('tool-call' in k for k in attrs.keys())
        
        react_features[span['span_id']] = {
            'has_thought': has_thought,
            'has_code': has_code,
            'has_tool_call': has_tool_call,
            'message_count': message_count
        }
    
    return react_features

def create_time_buckets(flat_spans: List[Dict], bucket_size: float = 10.0) -> Dict:
    """Create time-bucketed data for bar charts.
    
    Uses start_time to assign spans to buckets, then visualizes each span
    with its actual start_time (offset from bucket start) and duration.
    """
    if not flat_spans:
        return {'aggregated': [], 'individual': []}
    
    # Use ALL spans (not just leaf spans)
    # Find time range
    min_start = min(s['start'] for s in flat_spans)
    max_end = max(s['start'] + s['duration'] for s in flat_spans)
    
    # Create buckets based on start time
    num_buckets = int((max_end - min_start) / bucket_size) + 1
    buckets = []
    
    for i in range(num_buckets):
        bucket_start = min_start + i * bucket_size
        bucket_end = bucket_start + bucket_size
        
        # Find spans that START in this bucket
        spans_in_bucket = []
        for span in flat_spans:
            span_start = span['start']
            
            # Check if span starts in this bucket
            if bucket_start <= span_start < bucket_end:
                # Store the full span data with additional bucket-specific fields
                span_copy = {
                    'span_id': span['span_id'],
                    'name': span['name'],
                    'type': span['type'],
                    'duration': span['duration'],
                    'full_duration': span['duration'],
                    'start_offset': span_start - bucket_start,
                    'start_time': span_start,
                    'parent_id': span.get('parent_id'),
                    'level': span.get('level'),
                    'parent_name': span.get('parent_name'),
                    'tokens': span.get('tokens'),
                    'has_children': span.get('has_children', False),
                    'child_count': span.get('child_count', 0),
                    'attributes': span.get('attributes', {}),
                }
                spans_in_bucket.append(span_copy)
        
        buckets.append({
            'bucket_index': i,
            'bucket_start': bucket_start,
            'bucket_end': bucket_end,
            'spans': spans_in_bucket
        })
    
    # Aggregated: sum durations by type
    aggregated = []
    span_counts = []  # New: count spans by type over time
    
    for bucket in buckets:
        type_durations = defaultdict(float)
        type_counts = defaultdict(int)
        
        for span in bucket['spans']:
            type_durations[span['type']] += span['duration']
            type_counts[span['type']] += 1
        
        aggregated.append({
            'bucket_index': bucket['bucket_index'],
            'bucket_start': bucket['bucket_start'],
            'bucket_end': bucket['bucket_end'],
            'by_type': dict(type_durations)
        })
        
        span_counts.append({
            'bucket_index': bucket['bucket_index'],
            'bucket_start': bucket['bucket_start'],
            'bucket_end': bucket['bucket_end'],
            'by_type': dict(type_counts)
        })
    
    # Individual: keep all spans
    individual = buckets
    
    return {
        'aggregated': aggregated,
        'span_counts': span_counts,
        'individual': individual,
        'bucket_size': bucket_size,
        'min_start': min_start,
        'max_end': max_end
    }

def build_icicle_hierarchy(trace: Dict, flat_spans: List[Dict], react_features: Dict) -> Dict:
    """Build 7-layer hierarchy for icicle chart."""
    
    # Layer 1: Root
    trace_id = trace['trace_id']
    total_duration = sum(s['duration'] for s in flat_spans)
    
    root = {
        'name': f"Trace {trace_id[:8]}",
        'layer': 0,
        'attributes': {
            'trace_id': trace_id,
            'duration': total_duration,
            'total_spans': len(flat_spans)
        },
        'children': []
    }
    
    # Layer 2: Execution phases (Setup, Execution, Finalization)
    # Simplified: divide by time into 3 phases
    sorted_spans = sorted(flat_spans, key=lambda s: s['start'])
    if sorted_spans:
        min_start = sorted_spans[0]['start']
        max_end = max(s['start'] + s['duration'] for s in sorted_spans)
        duration = max_end - min_start
        
        # Setup: first 10%
        # Execution: middle 80%
        # Finalization: last 10%
        setup_end = min_start + duration * 0.1
        exec_end = min_start + duration * 0.9
        
        phases = {
            'Setup': [],
            'Execution': [],
            'Finalization': []
        }
        
        for span in flat_spans:
            span_mid = span['start'] + span['duration'] / 2
            if span_mid < setup_end:
                phases['Setup'].append(span)
            elif span_mid < exec_end:
                phases['Execution'].append(span)
            else:
                phases['Finalization'].append(span)
        
        # Layer 3: Span type categories within each phase
        for phase_name, phase_spans in phases.items():
            if not phase_spans:
                continue
            
            phase_duration = sum(s['duration'] for s in phase_spans)
            phase_node = {
                'name': phase_name,
                'layer': 1,
                'attributes': {
                    'span_count': len(phase_spans),
                    'duration': phase_duration
                },
                'children': []
            }
            
            # Group by type
            types = defaultdict(list)
            for span in phase_spans:
                types[span['type']].append(span)
            
            # Sort types by earliest start time
            for type_name, type_spans in sorted(types.items(), key=lambda x: min(s['start'] for s in x[1])):
                type_duration = sum(s['duration'] for s in type_spans)
                type_tokens = 0
                for s in type_spans:
                    tokens = s.get('tokens')
                    if tokens:
                        if isinstance(tokens, str):
                            tokens = int(tokens)
                        type_tokens += tokens
                type_node = {
                    'name': type_name,
                    'layer': 2,
                    'attributes': {
                        'span_count': len(type_spans),
                        'duration': type_duration,
                        'tokens': type_tokens if type_tokens > 0 else None
                    },
                    'children': []
                }
                
                # Layer 4: Individual spans (sorted by start time)
                for span in sorted(type_spans, key=lambda s: s['start']):
                    span_node = {
                        'name': span['name'],
                        'layer': 3,
                        'attributes': {
                            'span_id': span['span_id'],
                            'type': span['type'],
                            'level': span['level'],
                            'duration': span['duration'],
                            'tokens': span.get('tokens')
                        },
                        'children': []
                    }
                    
                    # Layer 5: ReAct components (only for CHAIN spans)
                    if span['type'] == 'CHAIN' and span['span_id'] in react_features:
                        features = react_features[span['span_id']]
                        
                        # Estimate proportions
                        if features['has_thought']:
                            span_node['children'].append({
                                'name': 'Thought',
                                'layer': 4,
                                'attributes': {
                                    'react_phase': 'thought',
                                    'duration': span['duration'] * 0.2
                                },
                                'children': []
                            })
                        
                        if features['has_code']:
                            # Split into LLM and Code execution
                            llm_child = next((s for s in flat_spans 
                                            if s['parent_id'] == span['span_id'] and s['type'] == 'LLM'), None)
                            if llm_child:
                                span_node['children'].append({
                                    'name': 'Action (LLM)',
                                    'layer': 4,
                                    'attributes': {
                                        'react_phase': 'action_llm',
                                        'duration': llm_child['duration'],
                                        'tokens': llm_child.get('tokens')
                                    },
                                    'children': []
                                })
                                
                                code_duration = span['duration'] - llm_child['duration']
                                if code_duration > 0:
                                    span_node['children'].append({
                                        'name': 'Action (Code)',
                                        'layer': 4,
                                        'attributes': {
                                            'react_phase': 'action_code',
                                            'duration': code_duration
                                        },
                                        'children': []
                                    })
                        
                        # Observation (simplified)
                        tool_children = [s for s in flat_spans 
                                       if s['parent_id'] == span['span_id'] and s['type'] == 'TOOL']
                        if tool_children:
                            span_node['children'].append({
                                'name': 'Observation',
                                'layer': 4,
                                'attributes': {
                                    'react_phase': 'observation',
                                    'duration': sum(t['duration'] for t in tool_children)
                                },
                                'children': []
                            })
                    
                    # Note: Layers 6 & 7 would require more detailed telemetry data
                    # that breaks down LLM and TOOL operations into finer-grained steps.
                    # The current trace data doesn't include this level of detail.
                    
                    type_node['children'].append(span_node)
                
                phase_node['children'].append(type_node)
            
            root['children'].append(phase_node)
    
    return root

def main():
    """Main processing pipeline."""
    print("Loading trace data...")
    trace = load_traces()
    
    print("Calculating metrics...")
    metrics = calculate_metrics(trace)
    
    print("Building span hierarchy...")
    flat_spans, tree, max_depth = build_span_hierarchy(trace)
    metrics['max_nesting_depth'] = max_depth
    
    print("Extracting ReAct features...")
    react_features = extract_react_features(flat_spans)
    
    print("Creating time buckets...")
    buckets = create_time_buckets(flat_spans, bucket_size=10.0)
    
    print("Building icicle hierarchy...")
    icicle = build_icicle_hierarchy(trace, flat_spans, react_features)
    
    # Save outputs - consolidated into 2 files
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    print("Saving processed data...")
    
    # File 1: Main trace data (metrics, hierarchy, buckets)
    with open(OUTPUT_DIR / "trace-data.json", 'w') as f:
        trace_data = {
            'metrics': metrics,
            'hierarchy': {
                'roots': tree['roots'],
                'span_map': tree['span_map']
            },
            'buckets': buckets
        }
        json.dump(trace_data, f, indent=2)
    
    # File 2: Icicle hierarchy (separate due to different structure)
    with open(OUTPUT_DIR / "trace-icicle.json", 'w') as f:
        json.dump(icicle, f, indent=2)
    
    print(f"\n✅ Processing complete!")
    print(f"Generated files in {OUTPUT_DIR}:")
    print(f"  - trace-data.json (metrics, hierarchy, buckets)")
    print(f"  - trace-icicle.json (icicle hierarchy)")
    print(f"\nMetrics summary:")
    print(f"  Total duration: {metrics['total_duration']:.2f}s")
    print(f"  Total spans: {metrics['total_spans']}")
    print(f"  Step count: {metrics['step_count']}")
    print(f"  LLM calls: {metrics['llm_call_count']}")
    print(f"  Total tokens: {metrics['total_tokens']}")
    print(f"  Max depth: {metrics['max_nesting_depth']}")

if __name__ == "__main__":
    main()

