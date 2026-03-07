# Slack App Setup for Switchboard Agent

Uses **Socket Mode** — no public URL required. The worker connects outbound to Slack via WebSocket.

## Step 1: Create the Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** > **From an app manifest**
3. Select your workspace
4. Paste the following manifest (YAML format):

```yaml
display_information:
  name: Switchboard Agent
  description: Your AI agent with access to all your Switchboard integrations
  background_color: "#3B82F6"
features:
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: false
  bot_user:
    display_name: Switchboard Agent
    always_online: true
oauth_config:
  scopes:
    bot:
      - chat:write
      - im:history
      - im:read
      - im:write
      - files:read
      - reactions:write
settings:
  event_subscriptions:
    bot_events:
      - message.im
  socket_mode_enabled: true
  org_deploy_enabled: false
  token_rotation_enabled: false
```

5. Review and click **Create**

## Step 2: Generate an App-Level Token

1. Go to **Basic Information** > **App-Level Tokens**
2. Click **Generate Token and Scopes**
3. Name it `socket-mode`, add scope `connections:write`
4. Click **Generate**
5. Copy the token (starts with `xapp-`) → set as `SLACK_APP_TOKEN`

## Step 3: Install to Workspace

1. Go to **Install App** > **Install to Workspace**
2. Review permissions and click **Allow**

## Step 4: Collect Bot Token

1. Go to **OAuth & Permissions**
2. Copy **Bot User OAuth Token** (`xoxb-...`) → set as `SLACK_BOT_TOKEN`

## Step 5: Deploy

Deploy the agent-worker with all env vars from `.env.example`. No public URL needed — the worker connects to Slack over WebSocket.

```bash
cd agent-worker
npm install
npm run dev    # local development
# or
npm run build && npm start  # production
```

## Step 6: Test

1. In Slack, find **Switchboard Agent** in your DMs
2. Send a message like "What integrations do I have connected?"
3. The bot should react with eyes, then reply with results

## Adding to Existing Slack App

If you want to add this to your existing Switchboard Slack app instead of creating a new one:

1. Go to your existing app settings
2. Enable **Socket Mode** in Settings
3. Generate an App-Level Token with `connections:write` scope
4. Add bot scopes: `chat:write`, `im:history`, `im:read`, `im:write`, `files:read`, `reactions:write`
5. Add `message.im` to Event Subscriptions > Bot Events
6. Re-install the app to apply new scopes

## Troubleshooting

### Bot does not respond
- Check that the worker process is running
- Verify `SLACK_APP_TOKEN` (xapp-) and `SLACK_BOT_TOKEN` (xoxb-) are set correctly
- Ensure the Slack user has connected their Slack account in Switchboard

### "I don't recognize your Slack account"
The user needs to disconnect and reconnect Slack in their Switchboard dashboard so `provider_user_id` gets captured.

### "still working on your last request"
Each user can only have one active session at a time. Wait for it to finish (4-hour timeout max).
