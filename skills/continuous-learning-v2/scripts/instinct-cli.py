#!/usr/bin/env python3
"""EAGLES Pro - Continuous Learning v2 Instinct CLI"""
import json, os, sys
from datetime import datetime
from pathlib import Path

INSTINCTS_DIR = Path(r'C:\.claude\skills\continuous-learning-v2\instincts')
OBSERVATIONS_FILE = INSTINCTS_DIR / 'observations.jsonl'

def load_instincts():
    instincts_file = INSTINCTS_DIR / 'instincts.json'
    if instincts_file.exists():
        return json.loads(instincts_file.read_text(encoding='utf-8'))
    return []

def save_instincts(instincts):
    instincts_file = INSTINCTS_DIR / 'instincts.json'
    instincts_file.write_text(json.dumps(instincts, indent=2, ensure_ascii=False), encoding='utf-8')

def status():
    instincts = load_instincts()
    if not instincts:
        print('No instincts captured yet. Use sessions to build patterns.')
        return
    print(f'Total instincts: {len(instincts)}')
    for i in sorted(instincts, key=lambda x: x.get('confidence', 0), reverse=True):
        conf = i.get('confidence', 0)
        bar = '#' * int(conf * 10)
        print(f'  [{conf:.1f}] {bar:10s} {i["pattern"][:60]}')

def export_instincts(output_path=None):
    instincts = load_instincts()
    if output_path is None:
        output_path = str(INSTINCTS_DIR / f'export-{datetime.now().strftime("%Y%m%d")}.json')
    Path(output_path).write_text(json.dumps(instincts, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'Exported {len(instincts)} instincts to {output_path}')

def import_instincts(input_path):
    new_instincts = json.loads(Path(input_path).read_text(encoding='utf-8'))
    existing = load_instincts()
    existing_ids = {i['id'] for i in existing}
    added = 0
    for inst in new_instincts:
        if inst['id'] not in existing_ids:
            inst['confidence'] = max(0.3, inst.get('confidence', 0.5) - 0.1)  # discount imported
            existing.append(inst)
            added += 1
    save_instincts(existing)
    print(f'Imported {added} new instincts (discounted confidence by 0.1)')

def evolve():
    instincts = load_instincts()
    strong = [i for i in instincts if i.get('confidence', 0) >= 0.7]
    categories = {}
    for i in strong:
        cat = i.get('category', 'general')
        categories.setdefault(cat, []).append(i)
    
    for cat, items in categories.items():
        if len(items) >= 3:
            print(f'
Cluster ready for evolution: {cat} ({len(items)} instincts)')
            for item in items:
                print(f'  [{item["confidence"]:.1f}] {item["pattern"][:50]}')
            print(f'  -> Recommend creating skill: {cat}-patterns.md')

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if cmd == 'status': status()
    elif cmd == 'export': export_instincts(sys.argv[2] if len(sys.argv) > 2 else None)
    elif cmd == 'import' and len(sys.argv) > 2: import_instincts(sys.argv[2])
    elif cmd == 'evolve': evolve()
    else: print('Usage: instinct-cli.py [status|export|import <file>|evolve]')
