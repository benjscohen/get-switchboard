#!/bin/bash
# ---------------------------------------------------------------------------
# Entrypoint: start Xvfb (virtual display) before the main process.
#
# Chrome DevTools MCP launches Chromium which needs a DISPLAY, even in
# headless mode on some builds. Xvfb provides a virtual framebuffer.
#
# If Xvfb fails to start here (e.g., permissions, already running),
# chrome.ts has a fallback that will try again before launching Chrome.
# ---------------------------------------------------------------------------

DISPLAY_NUM="${DISPLAY:-:99}"
LOCK_FILE="/tmp/.X${DISPLAY_NUM#:}-lock"

# Only start if not already running
if [ ! -f "$LOCK_FILE" ]; then
  echo "[entrypoint] starting Xvfb on $DISPLAY_NUM"
  Xvfb "$DISPLAY_NUM" -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
  XVFB_PID=$!

  # Wait up to 3 seconds for the lock file (indicates Xvfb is ready)
  for i in $(seq 1 6); do
    if [ -f "$LOCK_FILE" ]; then
      echo "[entrypoint] Xvfb ready (pid=$XVFB_PID)"
      break
    fi
    sleep 0.5
  done

  if [ ! -f "$LOCK_FILE" ]; then
    echo "[entrypoint] WARNING: Xvfb may not have started (no lock file)"
  fi
else
  echo "[entrypoint] Xvfb already running on $DISPLAY_NUM"
fi

export DISPLAY="$DISPLAY_NUM"
exec "$@"
