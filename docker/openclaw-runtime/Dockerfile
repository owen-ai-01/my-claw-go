FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    OPENCLAW_VERSION=2026.3.8 \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update && apt-get install -y \
    sudo \
    curl \
    wget \
    git \
    ca-certificates \
    procps \
    less \
    vim \
    nano \
    bash \
    bash-completion \
    python3 \
    passwd \
    adduser \
    jq \
    tree \
    iproute2 \
    net-tools \
    dnsutils \
    netcat-openbsd \
    socat \
  && rm -rf /var/lib/apt/lists/*

RUN id -u openclaw >/dev/null 2>&1 || adduser --disabled-password --gecos '' openclaw \
  && adduser openclaw sudo \
  && echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw \
  && chmod 0440 /etc/sudoers.d/openclaw \
  && mkdir -p /home/openclaw/.openclaw /home/openclaw/.openclaw/agents/main/agent /seed /opt/myclawgo-bridge \
  && chown -R openclaw:openclaw /home/openclaw/.openclaw /home/openclaw /seed /opt/myclawgo-bridge

RUN npm install -g openclaw@${OPENCLAW_VERSION}

COPY bridge/package.json /opt/myclawgo-bridge/package.json
COPY bridge/pnpm-lock.yaml /opt/myclawgo-bridge/pnpm-lock.yaml
COPY bridge/tsconfig.json /opt/myclawgo-bridge/tsconfig.json
COPY bridge/src /opt/myclawgo-bridge/src
RUN corepack enable \
  && cd /opt/myclawgo-bridge \
  && pnpm install --frozen-lockfile \
  && pnpm build \
  && chown -R openclaw:openclaw /opt/myclawgo-bridge

COPY docker/openclaw-runtime/entrypoint.sh /usr/local/bin/myclawgo-openclaw-entrypoint
RUN chmod +x /usr/local/bin/myclawgo-openclaw-entrypoint \
  && printf "\nalias ll='ls -alF'\nalias la='ls -A'\nalias l='ls -CF'\nexport EDITOR=vim\n" >> /etc/bash.bashrc \
  && printf "\nalias ll='ls -alF'\nalias la='ls -A'\nalias l='ls -CF'\nexport EDITOR=vim\n" >> /etc/skel/.bashrc \
  && printf "\nalias ll='ls -alF'\nalias la='ls -A'\nalias l='ls -CF'\nexport EDITOR=vim\n" >> /home/openclaw/.bashrc

ENTRYPOINT ["/usr/local/bin/myclawgo-openclaw-entrypoint"]
CMD ["sleep-infinity"]
