import zlib
import base64
import urllib.request
import ssl
import re

def encode_kroki(text):
    compressed = zlib.compress(text.encode('utf-8'), 9)
    return base64.urlsafe_b64encode(compressed).decode('utf-8')

# Read the file
with open('DIAGTRACE_DOCUMENTATION.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract PlantUML block
match = re.search(r'```plantuml\n(.*?)\n```', content, re.DOTALL)
if match:
    uml_text = match.group(1)
    
    # Get PNG from Kroki
    url = f"https://kroki.io/plantuml/png/{encode_kroki(uml_text)}"
    print(f"Fetching from {url}...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response:
            with open('architecture.png', 'wb') as f:
                f.write(response.read())
            print("architecture.png created successfully.")
    except Exception as e:
        print(f"Error fetching image: {e}")
else:
    print("Could not find PlantUML block in DIAGTRACE_DOCUMENTATION.md")
