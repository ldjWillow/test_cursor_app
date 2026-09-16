# WarehouseSim

Discrete-event warehouse simulation with digital twin visualization and virtual commissioning.

## Versions

- **V0.2** — Experiment & Traffic (scenario sweeps, TrafficManager, KPI/bottlenecks)
- **V0.3** — 3D Digital Twin & Virtual Commissioning

## Architecture

```text
Project Model → Simulation Engine → Digital Twin State → 2D / 3D Renderers
External WCS → Protocol Adapter → VirtualDevice FSM → Twin State
```

Three.js never owns business logic. Renderers only read `DigitalTwinState`.

## Scripts

```bash
npm install --legacy-peer-deps
npm run dev          # UI
npm run gateway      # HTTP/WS on :8787
npm run dev:all      # UI + gateway
npm test
npm run build
```

## Emulation API (gateway)

- `POST /api/devices/:id/commands`
- `GET /api/devices/:id/status`
- `POST /api/tasks`
- `GET /api/simulation/status`
- `POST /api/faults`
- `WS /ws`

## Schema

Projects use `schemaVersion: "0.3"` with migration from 0.1/0.2.
