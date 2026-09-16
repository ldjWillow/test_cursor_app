import { Button, Input, Space, Typography } from 'antd'
import { SimulationSpeed, SimulationStatus } from '../../types/index.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { simulationRuntime } from '../../simulation/SimulationRuntime.ts'
import { exportProject, importProject, loadProject, saveProject } from '../../persistence/projectPersistence.ts'
import {
  agvScenario,
  asrsScenario,
  conveyorScenario,
  emptyProject,
  stackerSinkScenario,
  standardWarehouseScenario,
} from '../../domain/base/scenarios.ts'
import { compareAgvCounts, runAgvExperiment } from '../../simulation/experiments.ts'
import { experimentManager } from '../../experiment/ExperimentManager.ts'
import { modelValidator } from '../../validation/ModelValidator.ts'

const SPEEDS: SimulationSpeed[] = [1, 5, 10, 50]

const SCENARIO_OPTIONS = [
  { value: 'empty', label: 'Empty project' },
  { value: 'conveyor', label: 'Source → Conveyor → Sink' },
  { value: 'agv', label: 'AGV A → N1 → N2 → B' },
  { value: 'asrs', label: 'Rack + Stacker inbound' },
  { value: 'stacker-sink', label: 'Source → Stacker → Sink' },
  { value: 'standard', label: 'Standard warehouse (V0.2)' },
]

function validateOrError(document: ReturnType<typeof useProjectStore.getState>['document']): boolean {
  const issues = modelValidator.validate(document)
  useSimulationStore.getState().setValidationErrors(issues.map((issue) => issue.message))
  if (issues.length > 0) {
    useSimulationStore.getState().setError(`Validation failed: ${issues[0]?.message}`)
    return false
  }
  useSimulationStore.getState().setError(undefined)
  return true
}

function loadScenario(key: string): void {
  const setDocument = useProjectStore.getState().setDocument
  if (key === 'conveyor') setDocument(conveyorScenario())
  if (key === 'agv') setDocument(agvScenario(3, 100))
  if (key === 'asrs') setDocument(asrsScenario())
  if (key === 'stacker-sink') setDocument(stackerSinkScenario())
  if (key === 'standard') setDocument(standardWarehouseScenario(4, 200))
  if (key === 'empty') setDocument(emptyProject('WarehouseSim'))
  simulationRuntime.reset(useProjectStore.getState().document, useProjectStore.getState().revision)
}

export default function Toolbar() {
  const document = useProjectStore((state) => state.document)
  const revision = useProjectStore((state) => state.revision)
  const setDocument = useProjectStore((state) => state.setDocument)
  const removeSelected = useProjectStore((state) => state.removeSelected)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const duplicateSelected = useProjectStore((state) => state.duplicateSelected)
  const speed = useSimulationStore((state) => state.speed)
  const status = useSimulationStore((state) => state.status)
  const resultsStale = useSimulationStore((state) => state.resultsStale)
  const setSpeed = useSimulationStore((state) => state.setSpeed)
  const setComparison = useSimulationStore((state) => state.setComparison)
  const setExperiment = useSimulationStore((state) => state.setExperiment)
  const setError = useSimulationStore((state) => state.setError)

  const editingLocked = status === SimulationStatus.Running
  const lockTitle = editingLocked ? '仿真运行中，请先 Pause 或 Reset' : undefined

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span>WarehouseSim</span>
        <Input
          size="small"
          value={document.project.name}
          disabled={editingLocked}
          title={lockTitle}
          onChange={(event) => useProjectStore.getState().setProjectName(event.target.value)}
        />
      </div>
      <Space size={6} wrap>
        <select
          aria-label="New scenario"
          className="scenario-select"
          disabled={editingLocked}
          defaultValue=""
          onChange={(event) => {
            const key = event.target.value
            if (!key) {
              return
            }
            loadScenario(key)
            event.target.value = ''
          }}
        >
          <option value="" disabled>
            New scenario…
          </option>
          {SCENARIO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button size="small" onClick={() => saveProject(document)}>
          Save
        </Button>
        <Button
          size="small"
          disabled={editingLocked}
          title={lockTitle}
          onClick={() => {
            const loaded = loadProject()
            if (loaded) {
              setDocument(loaded)
            } else {
              setError('No saved project in LocalStorage')
            }
          }}
        >
          Load
        </Button>
        <Button size="small" onClick={() => exportProject(document)}>
          Export
        </Button>
        <Button
          size="small"
          disabled={editingLocked}
          title={lockTitle}
          onClick={() => {
            const input = window.document.createElement('input')
            input.type = 'file'
            input.accept = 'application/json'
            input.onchange = async () => {
              const file = input.files?.[0]
              if (!file) {
                return
              }
              try {
                setDocument(await importProject(file))
              } catch (error) {
                setError(error instanceof Error ? error.message : 'Import failed')
              }
            }
            input.click()
          }}
        >
          Import
        </Button>
        <Button size="small" disabled={editingLocked} title={lockTitle} onClick={undo}>
          Undo
        </Button>
        <Button size="small" disabled={editingLocked} title={lockTitle} onClick={redo}>
          Redo
        </Button>
        <Button size="small" disabled={editingLocked} title={lockTitle} onClick={duplicateSelected}>
          Duplicate
        </Button>
        <Button size="small" danger disabled={editingLocked} title={lockTitle} onClick={removeSelected}>
          Delete
        </Button>
        <span className="toolbar-sep" />
        <Button
          size="small"
          type="primary"
          disabled={status === SimulationStatus.Running}
          onClick={() => {
            if (!validateOrError(document)) {
              return
            }
            simulationRuntime.start(document, revision, speed)
          }}
        >
          Start
        </Button>
        <Button
          size="small"
          disabled={status !== SimulationStatus.Running}
          onClick={() => simulationRuntime.pause()}
        >
          Pause
        </Button>
        <Button size="small" onClick={() => simulationRuntime.reset(document, revision)}>
          Reset
        </Button>
        <Button
          size="small"
          disabled={status === SimulationStatus.Running}
          title="Step = process exactly one discrete event"
          onClick={() => simulationRuntime.step(document, revision)}
        >
          Step
        </Button>
        {SPEEDS.map((value) => (
          <Button
            key={value}
            size="small"
            type={speed === value ? 'primary' : 'default'}
            onClick={() => {
              setSpeed(value)
              simulationRuntime.setSpeed(value)
            }}
          >
            {value}x
          </Button>
        ))}
        <Button
          size="small"
          onClick={() => {
            if (!validateOrError(document)) {
              return
            }
            simulationRuntime.runToEnd(document, revision)
          }}
        >
          Run to end
        </Button>
        <Button
          size="small"
          onClick={() => {
            if (!validateOrError(document)) {
              return
            }
            setComparison(compareAgvCounts(document, [3, 4, 5, 6]))
          }}
        >
          Compare 3-6 AGVs (current model)
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            if (!validateOrError(document)) {
              return
            }
            const { results, summaries } = runAgvExperiment(document, [3, 4, 5, 6], 1, document.simulationConfig.seed)
            const deltas = experimentManager.compareSummaries(summaries)
            setExperiment(results, summaries, deltas)
            setComparison(
              summaries.map((summary) => ({
                agvCount: summary.agvCount,
                throughput: summary.throughput.mean,
                utilization: summary.agvUtilization.mean,
                averageWaitingTime: summary.averageWaitingTime.mean,
                averageCycleTime: summary.averageCycleTime.mean,
                completedTasks: Math.round(summary.completedTasks.mean),
                simulationTime: summary.results[0]?.simulationTime ?? 0,
                emptyTravelRatio: summary.emptyTravelRatio.mean,
                routeWaitingTime: summary.routeWaitingTime.mean,
                taskCount: document.simulationConfig.taskCount || document.tasks.length,
                seed: document.simulationConfig.seed,
              })),
            )
          }}
        >
          Run Experiment
        </Button>
      </Space>
      <Typography.Text className="toolbar-status" type="secondary">
        v0.2 · {status === SimulationStatus.Idle ? 'IDLE' : status.toUpperCase()}
        {resultsStale ? ' · STALE' : ''}
      </Typography.Text>
    </header>
  )
}
