# Bridge releases/current rollout

## Host layout

```text
/home/openclaw/myclawgo-bridge/
  releases/
    20260315-153000/
      package.json
      pnpm-lock.yaml
      dist/
      node_modules/
  current -> /home/openclaw/myclawgo-bridge/releases/20260315-153000
```

## Publish a new bridge build

```bash
bash scripts/publish-bridge-release.sh
```

## Publish + restart all runtime containers

```bash
bash scripts/publish-and-rollout-bridge.sh
```

## Notes

- Runtime containers mount `/home/openclaw/myclawgo-bridge` read-only into the container.
- Entrypoint starts bridge from `/opt/myclawgo-bridge/current/dist/server.js`.
- After switching `current`, restart runtime containers so they pick up the new bridge release.
