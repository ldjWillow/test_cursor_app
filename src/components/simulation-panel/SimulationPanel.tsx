import { Button, InputNumber, Select, Table } from 'antd'
import { useMemo, useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { DeviceType } from '../../types/index.ts'
import { round } from '../../utils/math.ts'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function SimulationPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot)
  const comparison = useSimulationStore((state) => state.comparison)
  const lastError = useSimulationStore((state) => state.lastError)
  const document = useProjectStore((state) => state.document)
  const replaceTasks = useProjectStore((state) => state.replaceTasks)
  const stations = document.devices.filter(
    (device) => device.type === DeviceType.Station || device.type === DeviceType.PathNode,
  )
  const [sourceId, setSourceId] = useState(document.simulationConfig.taskSourceId ?? stations[0]?.id)
  const [targetId, setTargetId] = useState(document.simulationConfig.taskTargetId ?? stations[1]?.id)
  const [taskCount, setTaskCount] = useState(document.simulationConfig.taskCount || 100)
  const stats = snapshot.statistics
  const options = useMemo(
    () => stations.map((station) => ({ value: station.id, label: station.name })),
    [stations],
  )

  return (
    <footer className="simulation-panel">
      <div className="sim-metrics">
        <Metric label="Simulation Time" value={`${round(snapshot.time, 2)} s`} />
        <Metric label="Waiting Tasks" value={String(snapshot.waitingTasks)} />
        <Metric label="Running Tasks" value={String(snapshot.runningTasks)} />
        <Metric label="Completed Tasks" value={String(snapshot.completedTasks)} />
        <Metric label="Throughput" value={`${round(stats.throughput, 2)} /h`} />
        <Metric label="Avg Wait" value={`${round(stats.averageWaitingTime, 2)} s`} />
        <Metric label="AGV Util" value={`${round(stats.agvUtilization * 100, 1)}%`} />
        <Metric label="Conveyor Util" value={`${round(stats.conveyorUtilization * 100, 1)}%`} />
        <Metric label="Generated" value={String(stats.generatedCount)} />
        <Metric label="Completed Qty" value={String(stats.completedCount)} />
      </div>

      <div className="sim-columns">
        <section>
          <div className="panel-title">Event Queue</div>
          <div className="event-list">
            {snapshot.eventQueue.length === 0 && <div className="panel-hint">Empty</div>}
            {snapshot.eventQueue.slice(0, 8).map((event) => (
              <div key={event.id}>
                t={event.time.toFixed(2)} {event.type}
                {event.targetId ? ` @ ${event.targetId}` : ''}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="panel-title">Bottlenecks</div>
          {stats.bottlenecks.length === 0 && <div className="panel-hint">None</div>}
          {stats.bottlenecks.map((item) => (
            <div key={`${item.id}-${item.reason}`}>
              {item.name}: {item.reason}
            </div>
          ))}
          {lastError && <div className="sim-error">{lastError}</div>}
        </section>

        <section>
          <div className="panel-title">Transport Tasks</div>
          <div className="task-config">
            <Select
              size="small"
              placeholder="Pickup"
              options={options}
              value={sourceId}
              onChange={setSourceId}
              style={{ width: 120 }}
            />
            <Select
              size="small"
              placeholder="Dropoff"
              options={options}
              value={targetId}
              onChange={setTargetId}
              style={{ width: 120 }}
            />
            <InputNumber
              size="small"
              min={1}
              max={1000}
              value={taskCount}
              onChange={(value) => setTaskCount(typeof value === 'number' ? value : 100)}
            />
            <Button
              size="small"
              disabled={!sourceId || !targetId}
              onClick={() => {
                if (sourceId && targetId) {
                  replaceTasks(sourceId, targetId, taskCount)
                }
              }}
            >
              Apply tasks
            </Button>
            <span className="panel-hint">{document.tasks.length} tasks in model</span>
          </div>
        </section>

        <section className="comparison-section">
          <div className="panel-title">AGV comparison</div>
          <Table
            size="small"
            pagination={false}
            rowKey="agvCount"
            dataSource={comparison}
            columns={[
              { title: 'AGVs', dataIndex: 'agvCount', width: 70 },
              { title: 'Throughput /h', dataIndex: 'throughput', render: (value: number) => round(value, 1) },
              { title: 'Util %', dataIndex: 'utilization', render: (value: number) => round(value * 100, 1) },
              { title: 'Avg Wait s', dataIndex: 'averageWaitingTime', render: (value: number) => round(value, 2) },
              { title: 'Cycle s', dataIndex: 'averageCycleTime', render: (value: number) => round(value, 2) },
              { title: 'Sim s', dataIndex: 'simulationTime', render: (value: number) => round(value, 1) },
            ]}
          />
        </section>
      </div>
    </footer>
  )
}
