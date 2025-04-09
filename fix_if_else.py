#!/usr/bin/env python3

with open('rides/views.py', 'r') as f:
    lines = f.readlines()

# Look for the problematic lines
for i, line in enumerate(lines):
    if 'deviation_score = max(0, 100 - min(deviation_percentage, 100))' in line and i+2 < len(lines) and 'else:' in lines[i+2]:
        # Found the issue, remove the existing else and add a properly indented one
        lines[i+2] = '    else:\n'
        break

with open('rides/views.py', 'w') as f:
    f.writelines(lines)

print("Fixed if-else structure in views.py") 