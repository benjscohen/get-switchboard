#!/bin/bash
# Start Xvfb (virtual display) so Chrome DevTools MCP can launch Chromium.
# The MCP server expects a working DISPLAY; without it every tool call fails
# with "Missing X server to start the headful browser."

Xvfb :99 -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Wait for the display to be ready
sleep 1

exec "$@"
