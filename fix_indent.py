import re

def fix_indentation():
    # Read the file
    with open('rides/views.py', 'r') as file:
        content = file.readlines()
    
    # Find the start of the problematic function
    function_start = -1
    function_end = -1
    for i, line in enumerate(content):
        if 'def calculate_route_overlap(' in line:
            function_start = i
            break
    
    if function_start == -1:
        print("Could not find calculate_route_overlap function")
        return
    
    print(f"Found calculate_route_overlap function at line {function_start + 1}")
    
    # Find the function end
    for i in range(function_start + 1, len(content)):
        # If we find another function definition at the same indentation level, we've passed the end
        if content[i].startswith('def '):
            function_end = i - 1
            break
    
    if function_end == -1:
        function_end = len(content) - 1
    
    print(f"Function ends around line {function_end + 1}")
    
    # Extract the function
    function_lines = content[function_start:function_end+1]
    
    # Get base indentation level from the first line (def statement)
    base_indent = len(function_lines[0]) - len(function_lines[0].lstrip())
    
    # Normalize indentation
    fixed_lines = []
    
    # Add the function definition
    fixed_lines.append(function_lines[0])
    
    # Process the docstring and other lines
    docstring_started = False
    docstring_ended = False
    
    for i in range(1, len(function_lines)):
        line = function_lines[i]
        stripped_line = line.lstrip()
        
        # Skip empty lines
        if not stripped_line:
            fixed_lines.append(line)
            continue
        
        # Handle docstring
        if not docstring_started and stripped_line.startswith('"""'):
            docstring_started = True
            if stripped_line.endswith('"""') and len(stripped_line) > 3:
                docstring_ended = True
            fixed_lines.append(' ' * (base_indent + 4) + stripped_line)
            continue
        
        if docstring_started and not docstring_ended:
            if stripped_line.endswith('"""'):
                docstring_ended = True
            fixed_lines.append(' ' * (base_indent + 4) + stripped_line)
            continue
        
        # Normal lines after docstring
        fixed_lines.append(' ' * (base_indent + 4) + stripped_line)
    
    # Replace the original function with the fixed version
    content[function_start:function_end+1] = fixed_lines
    
    # Write the fixed content back to the file
    with open('rides/views.py', 'w') as file:
        file.writelines(content)
    
    print("Indentation fixed in views.py")

if __name__ == "__main__":
    fix_indentation() 