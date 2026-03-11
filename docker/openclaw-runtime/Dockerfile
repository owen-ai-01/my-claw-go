FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    OPENCLAW_VERSION=2026.3.8 \
    PATH=/usr/local/bin:/usr/bin:/bin

RUN apt-get update && apt-get install -y \
    sudo \
    curl \
    git \
    ca-certificates \
    procps \
    less \
    vim \
    nano \
    bash \
    python3 \
    nodejs \
    npm \
    passwd \
    adduser \
  && rm -rf /var/lib/apt/lists/*

RUN id -u openclaw >/dev/null 2>&1 || adduser --disabled-password --gecos '' openclaw \
  && adduser openclaw sudo \
  && echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw \
  && chmod 0440 /etc/sudoers.d/openclaw \
  && mkdir -p /home/openclaw/.openclaw /home/openclaw/.openclaw/agents/main/agent /seed \
  && chown -R openclaw:openclaw /home/openclaw/.openclaw /home/openclaw /seed

RUN npm install -g openclaw@${OPENCLAW_VERSION}

COPY entrypoint.sh /usr/local/bin/myclawgo-openclaw-entrypoint
RUN chmod +x /usr/local/bin/myclawgo-openclaw-entrypoint

ENTRYPOINT ["/usr/local/bin/myclawgo-openclaw-entrypoint"]
CMD ["sleep-infinity"]
