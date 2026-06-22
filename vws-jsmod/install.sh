#!/usr/bin/env bash
set -euo pipefail
APP="/Applications/Vivaldi.app"
if [[ ! -d "$APP" ]]; then
  echo "未找到 $APP"
  exit 1
fi
BASE="$APP/Contents/Frameworks/Vivaldi Framework.framework/Versions"
VER_DIR="$(find "$BASE" -maxdepth 1 -mindepth 1 -type d | sort | tail -1)"
VIVALDI_RES="$VER_DIR/Resources/vivaldi"
WINDOW_HTML="$VIVALDI_RES/window.html"
SCRIPT_NAME="vivaldi-workspace-bridge.js"
SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)/$SCRIPT_NAME"
SCRIPT_DST="$VIVALDI_RES/$SCRIPT_NAME"
if [[ ! -f "$WINDOW_HTML" ]]; then
  echo "找不到 window.html: $WINDOW_HTML"
  exit 1
fi
if [[ ! -f "$SCRIPT_SRC" ]]; then
  echo "找不到 $SCRIPT_SRC"
  exit 1
fi
echo "安装到: $VIVALDI_RES"
sudo cp "$SCRIPT_SRC" "$SCRIPT_DST"
sudo python3 - "$WINDOW_HTML" "$SCRIPT_NAME" <<'PY'
import sys, re, pathlib
html = pathlib.Path(sys.argv[1])
script = sys.argv[2]
s = html.read_text(encoding='utf-8')
# remove old VWS script tags only, preserve everything else
s = re.sub(r'\s*<script[^>]+src=["\'][^"\']*vivaldi-workspace-(?:stash|bridge)[^"\']*\.js["\'][^>]*>\s*</script>\s*', '\n', s, flags=re.I)
tag = f'<script src="{script}"></script>'
if tag not in s:
    if '</body>' in s:
        s = s.replace('</body>', f'  {tag}\n</body>', 1)
    else:
        s += '\n' + tag + '\n'
html.write_text(s, encoding='utf-8')
PY
echo "完成。请完全退出 Vivaldi 后重新打开。"
echo "验证：vivaldi://inspect/#apps -> main.html -> Console 执行 window.vwsBridge.version"
