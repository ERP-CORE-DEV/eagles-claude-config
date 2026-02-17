import sys, json

d = json.load(sys.stdin)
p = d.get('tool_input', {}).get('file_path', '').replace('\', '/')

# Allow non-.md files
if not p.endswith('.md'):
    sys.exit(0)

# Allow these paths
allowed = ['/docs/', 'CLAUDE', 'README', 'CHANGELOG', 'SKILL', 'rules/', 'agents/', 'memory/']
for a in allowed:
    if a in p:
        sys.exit(0)

# Block other .md files
sys.exit(2)