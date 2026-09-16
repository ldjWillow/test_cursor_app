# WarehouseSim

Discrete-event warehouse simulation with digital twin visualization, virtual commissioning, and industrial protocol connectivity.

## Versions

- **V0.2** — Experiment & Traffic
- **V0.3** — 3D Digital Twin & Virtual Commissioning
- **V0.4** — Industrial Connectivity & PLC Integration

## Architecture

```text
External System (PLC / WCS / ACS)
  → Protocol Adapter (OPC UA | Modbus | MQTT | TCP | HTTP | WS)
    → Signal Mapping → Command Bus → Virtual Device → Simulation Engine
      → Device State → Feedback Bus → Signal Mapping → Protocol Adapter
```

Devices never import protocols. Protocols never own device FSMs.

## Scripts

```bash
npm install --legacy-peer-deps
npm run dev          # UI
npm run gateway      # HTTP/WS on :8787
npm run dev:all      # UI + gateway
npm test
npm run build
```

## V0.4 UI

Model · Simulation · Experiments · 3D Twin · Commissioning · **Connections** · **Signals** · **Protocol Monitor** · Replay

## Emulation / Integration API

- `POST /api/devices/:id/commands`
- `GET /api/devices/:id/status`
- `POST /api/tasks`
- `GET/POST /api/connections` · connect · disconnect · test
- `GET /api/signals` · `/api/signals/trace`
- `GET /api/protocol/log`
- `POST /api/faults` (device + network delay/loss/disconnect)
- `WS /ws`

## Schema

Projects use `schemaVersion: "0.4"` with migration from 0.1–0.3.
Industrial slice: `connections`, `signalMappings`, `ioMappings` (secrets exported as references).

## Demos

Protocol Monitor → **Run Full PLC/WCS/ACS Demo**, or PLC Conveyor / Modbus / MQTT AGV.
