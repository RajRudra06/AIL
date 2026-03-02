print("Before import")
import sys
sys.path.insert(0, '.')

from cp1_setup import run_checkpoint1

print("Starting CP1...")


result = run_checkpoint1('/Users/rudrarajpurohit/Desktop/AIL/my-app/ish_repo')
print("CP1 done")
print(f"Files found: {len(result.source_files)}")
print(f"Languages: {result.active_languages}")
