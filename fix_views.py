def fix_views_indentation():
    # Read the file
    with open('rides/views.py', 'r') as file:
        lines = file.readlines()
    
    print("Looking for indentation issues...")
    
    # Find all if statements and check their indentation
    for i in range(len(lines)):
        line = lines[i].rstrip()
        
        # Check if this is an if statement
        if line.lstrip().startswith('if ') and line.rstrip().endswith(':'):
            current_indent = len(line) - len(line.lstrip())
            expected_next_indent = current_indent + 4  # Standard Python indentation
            
            # Check the next line's indentation if it exists
            if i + 1 < len(lines) and lines[i + 1].strip():
                next_line = lines[i + 1]
                next_indent = len(next_line) - len(next_line.lstrip())
                
                if next_indent <= current_indent:
                    print(f"Found indentation issue at line {i+2} (after 'if' at line {i+1})")
                    print(f"  Current: {line}")
                    print(f"  Next: {next_line.rstrip()}")
                    
                    # Fix the block indentation
                    block_start = i + 1
                    while block_start < len(lines) and lines[block_start].strip():
                        if not lines[block_start].lstrip().startswith(('elif', 'else', 'except', 'finally')):
                            fixed_line = ' ' * expected_next_indent + lines[block_start].lstrip()
                            lines[block_start] = fixed_line
                            print(f"  Fixed to: {fixed_line.rstrip()}")
                        
                        # If we see a 'return' statement, we've potentially reached the end of this block
                        if lines[block_start].lstrip().startswith('return'):
                            break
                            
                        block_start += 1
    
    # Write the fixed content back to the file
    with open('rides/views.py', 'w') as file:
        file.writelines(lines)
    
    print("Indentation fixed in views.py")

if __name__ == "__main__":
    fix_views_indentation() 