FROM node:20
WORKDIR /app

# Dev environment: Python + Node.js + common tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    curl \
    wget \
    jq \
    zip \
    unzip \
    sqlite3 \
    postgresql-client \
    ripgrep \
    tree \
    sudo \
    ca-certificates \
    gnupg \
    software-properties-common \
    # Chrome MCP dependencies: virtual display + browser
    xvfb \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
  && rm -rf /var/lib/apt/lists/*

# Chrome DevTools MCP server (used by Claude Code SDK as a stdio MCP)
RUN npm install -g chrome-devtools-mcp@latest

# Install Terraform
RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/hashicorp.list \
 && apt-get update && apt-get install -y terraform \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --production

ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Entrypoint: starts Xvfb before the main process
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Worker user with sudo access (container is ephemeral)
RUN useradd -m -s /bin/bash worker \
 && echo "worker ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
USER worker

# Git defaults
RUN git config --global init.defaultBranch main \
 && git config --global advice.detachedHead false

# Pre-install common Python packages
RUN pip install --user --break-system-packages fastapi uvicorn httpx requests pandas numpy

# User-local bin on PATH
ENV PATH="/home/worker/.local/bin:${PATH}"

# Chrome MCP: Xvfb provides a virtual display so Chromium can run in the
# container. CHROME_PATH tells chrome-devtools-mcp where to find the browser.
ENV DISPLAY=:99

ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
