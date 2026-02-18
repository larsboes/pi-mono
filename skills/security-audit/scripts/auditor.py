import os
import re
import ast
import json
import sys
from pathlib import Path

class RepoAuditor:
    def __init__(self, root_path):
        self.root = Path(root_path).resolve()
        self.report = {
            "network_endpoints": set(),
            "env_vars": set(),
            "dangerous_calls": [],
            "suspicious_blobs": [],
            "files_scanned": 0
        }
        # Patterns
        self.url_pattern = re.compile(r'https?://[^\s"\'`()<>]+')
        self.env_pattern = re.compile(r'process\.env\.([A-Z0-9_]+)|os\.environ\[[\'"]([A-Z0-9_]+)[\'"]\]|getenv\([\'"]([A-Z0-9_]+)[\'"]\)')
        self.blob_pattern = re.compile(r'[A-Za-z0-9+/]{128,}') # Potential base64 blobs

    def audit(self):
        for path in self.root.rglob('*'):
            if any(part.startswith('.') for part in path.parts) or 'node_modules' in path.parts or 'venv' in path.parts:
                continue
            if path.is_file():
                self.report["files_scanned"] += 1
                self.scan_file(path)
        
        # Convert sets to sorted lists for JSON
        self.report["network_endpoints"] = sorted(list(self.report["network_endpoints"]))
        self.report["env_vars"] = sorted(list(self.report["env_vars"]))
        return self.report

    def scan_file(self, path):
        try:
            content = path.read_text(errors='ignore')
            
            # 1. URL Detection
            for url in self.url_pattern.findall(content):
                self.report["network_endpoints"].add(url)

            # 2. Env Var Detection
            for match in self.env_pattern.findall(content):
                for group in match:
                    if group: self.report["env_vars"].add(group)

            # 3. Blob Detection
            for blob in self.blob_pattern.findall(content):
                self.report["suspicious_blobs"].append({"file": str(path.relative_to(self.root)), "length": len(blob)})

            # 4. Dangerous Function Calls
            dangerous_fns = ['eval(', 'exec(', 'spawn(', 'fork(', 'os.system(', 'subprocess.run(', 'setTimeout(', 'setInterval(']
            for fn in dangerous_fns:
                if fn in content:
                    self.report["dangerous_calls"].append({"file": str(path.relative_to(self.root)), "call": fn})

        except Exception as e:
            pass

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    auditor = RepoAuditor(target)
    result = auditor.audit()
    print(json.dumps(result, indent=2))
