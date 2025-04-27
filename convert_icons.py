import cairosvg
import os

# Create icons directory if it doesn't exist
if not os.path.exists('icons'):
    os.makedirs('icons')

# Convert SVG to different PNG sizes
sizes = [16, 48, 128]
for size in sizes:
    cairosvg.svg2png(url='icons/icon.svg',
                     write_to=f'icons/icon{size}.png',
                     output_width=size,
                     output_height=size) 