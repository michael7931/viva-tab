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
UTILS_NAME="workspace-tab-utils.js"
UTILS_SRC="$(cd "$(dirname "$0")" && pwd)/$UTILS_NAME"
UTILS_DST="$VIVALDI_RES/$UTILS_NAME"
if [[ ! -f "$WINDOW_HTML" ]]; then
  echo "找不到 window.html: $WINDOW_HTML"
  exit 1
fi
if [[ ! -f "$SCRIPT_SRC" ]]; then
  echo "找不到 $SCRIPT_SRC"
  exit 1
fi
if [[ ! -f "$UTILS_SRC" ]]; then
  echo "找不到 $UTILS_SRC"
  exit 1
fi
echo "安装到: $VIVALDI_RES"
sudo cp "$UTILS_SRC" "$UTILS_DST"
sudo cp "$SCRIPT_SRC" "$SCRIPT_DST"
sudo python3 - "$WINDOW_HTML" "$UTILS_NAME" "$SCRIPT_NAME" <<'PY'
import sys, re, pathlib
html = pathlib.Path(sys.argv[1])
scripts = sys.argv[2:]
s = html.read_text(encoding='utf-8')
# remove old VWS script tags only, preserve everything else
s = re.sub(r'\s*<script[^>]+src=["\'][^"\']*(?:vivaldi-workspace-(?:stash|bridge)|workspace-tab-utils)\.js["\'][^>]*>\s*</script>\s*', '\n', s, flags=re.I)
tags = ''.join(f'  <script src="{script}"></script>\n' for script in scripts)
if '</body>' in s:
    s = s.replace('</body>', f'{tags}</body>', 1)
else:
    s += '\n' + tags
html.write_text(s, encoding='utf-8')
PY
echo "完成。请完全退出 Vivaldi 后重新打开。"
echo "验证：vivaldi://inspect/#apps -> mpogn.../window.html -> Console 执行 window.vwsBridge.version"
