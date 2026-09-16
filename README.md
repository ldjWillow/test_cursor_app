# WarehouseSim

Discrete-event warehouse simulation for layout design, AGV fleet experiments, and bottleneck analysis.

## V0.2 — Experiment & Traffic

- Scenario overrides + batch ExperimentManager (with replications)
- Reservation-based TrafficManager (node/edge conflict + waiting)
- TaskGenerator / DemandProfile + seeded RandomGenerator
- Waiting-time breakdown, AGV KPIs, BottleneckAnalyzer
- Experiment Results charts, Event Log, AGV Timeline
- ModelValidator, Undo/Redo, Duplicate, device templates

## Scripts

```bash
npm install
npm run dev
npm test
npm run build
```

## Schema

Projects use `schemaVersion: "0.2"`. Older JSON is migrated on import/load.
