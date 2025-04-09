#!/usr/bin/env python
"""
Script to fix improperly formatted f-strings in the views.py file
"""

with open('rides/views.py', 'r') as f:
    content = f.read()

# Fix multiline f-strings
content = content.replace('f"Failed to get driving distance, using great_circle: {\n        str(e)}")', 
                         'f"Failed to get driving distance, using great_circle: {str(e)}")')
content = content.replace('f"Failed to get driving distance, using great_circle: {\n    str(e)}")', 
                         'f"Failed to get driving distance, using great_circle: {str(e)}")')
content = content.replace('f"Error in calculating distance for overlap: {\n        str(e)}")', 
                         'f"Error in calculating distance for overlap: {str(e)}")')

with open('rides/views.py', 'w') as f:
    f.write(content)

print('Fixed file written to rides/views.py') 