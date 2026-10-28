#!/bin/zsh
# Runs test/test.html in headless Chrome and prints the results.
DIR="${0:A:h}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --allow-file-access-from-files \
  --virtual-time-budget=20000 --dump-dom "file://$DIR/test.html" 2>/dev/null \
  | python3 -c "import sys,re,html; m=re.search(r'<pre id=\"out\">(.*?)</pre>', sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else 'NO OUTPUT')"
