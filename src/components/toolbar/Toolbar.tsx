import { Button, Dropdown, Input, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { SimulationSpeed, SimulationStatus } from '../../types/index.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'
import { simulationRuntime } from '../../simulation/SimulationRuntime.ts'
import { exportProject, importProject, loadProject, saveProject } from '../../persistence/projectPersistence.ts'
import {
  agvScenario,
  asrsScenario,
  conveyorScenario,
  emptyProject,
  standardWarehouseScenario,
} from '../../domain/base/scenarios.ts'
import { automatedWarehouseDemo } from '../../domain/base/demoScenes.ts'
import { compareAgvCounts, runAgvExperiment } from '../../simulation/experiments.ts'
import { experimentManager } from '../../experiment/ExperimentManager.ts'
import { modelValidator } from '../../validation/ModelValidator.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { replayEngine } from '../../replay/ReplayEngine.ts'
import { useNavStore } from '../../store/navStore.ts'
import type { PrimaryNav } from '../../store/navStore.ts'
import { industrialRuntime } from '../../industrial/IndustrialRuntime.ts'

const SPEEDS: SimulationSpeed[] = [1, 5, 10, 50]

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
  const setSpeed = useSimulationStore((state) => state.setSpeed)
  const setComparison = useSimulationStore((state) => state.setComparison)
  const setExperiment = useSimulationStore((state) => state.setExperiment)
  const setError = useSimulationStore((state) => state.setError)
  const viewMode = useDigitalTwinStore((state) => state.viewMode)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)
  const operatingMode = useDigitalTwinStore((state) => state.operatingMode)
  const setOperatingMode = useDigitalTwinStore((state) => state.setOperatingMode)
  const snapshot = useSimulationStore((state) => state.snapshot)
  const primaryNav = useNavStore((state) => state.primaryNav)
  const setPrimaryNav = useNavStore((state) => state.setPrimaryNav)

  const navItems: Array<{ key: PrimaryNav; label: string }> = [
    { key: 'model', label: 'Model' },
    { key: 'simulation', label: 'Simulation' },
    { key: 'experiments', label: 'Experiments' },
    { key: 'twin3d', label: '3D Twin' },
    { key: 'commissioning', label: 'Commissioning' },
    { key: 'connections', label: 'Connections' },
    { key: 'signals', label: 'Signals' },
    { key: 'protocol', label: 'Protocol Monitor' },
    { key: 'replay', label: 'Replay' },
  ]

  const scenarioItems: MenuProps['items'] = [
    { key: 'empty', label: 'Empty project' },
    { key: 'conveyor', label: 'Template: Conveyor Warehouse' },
    { key: 'agv', label: 'Template: AGV Warehouse' },
    { key: 'asrs', label: 'Template: ASRS Warehouse' },
    { key: 'demo', label: 'Template: AGV + ASRS Demo' },
    { key: 'standard', label: 'Standard warehouse (analysis)' },
  ]

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span>WarehouseSim</span>
        <Input
          size="small"
          value={document.project.name}
          onChange={(event) => useProjectStore.getState().setProjectName(event.target.value)}
        />
      </div>
      <Space size={4} wrap className="primary-nav">
        {navItems.map((item) => (
          <Button
            key={item.key}
            size="small"
            type={primaryNav === item.key ? 'primary' : 'default'}
            onClick={() => {
              setPrimaryNav(item.key)
              if (item.key === 'twin3d') setViewMode('3d')
              if (item.key === 'model') setViewMode('2d')
              if (item.key === 'replay') {
                setOperatingMode('replay')
                replayEngine.load(snapshot.eventLog)
                replayEngine.play(5)
              }
            }}
          >
            {item.label}
          </Button>
        ))}
      </Space>
      <span className="toolbar-sep" />
      <Space size={6} wrap>
        <Dropdown
          menu={{
            items: scenarioItems,
            onClick: ({ key }) => {
              if (key === 'conveyor') setDocument(conveyorScenario())
              if (key === 'agv') setDocument(agvScenario(3, 100))
              if (key === 'asrs') setDocument(asrsScenario())
              if (key === 'demo') setDocument(automatedWarehouseDemo(200))
              if (key === 'standard') setDocument(standardWarehouseScenario(4, 200))
              if (key === 'empty') setDocument(emptyProject('WarehouseSim'))
              const next = useProjectStore.getState().document
              deviceRegistry.loadFromProject(next)
              simulationRuntime.reset(next, useProjectStore.getState().revision)
              industrialRuntime.bootstrapFromProject(next)
            },
          }}
        >
          <Button size="small">New</Button>
        </Dropdown>
        <Button size="small" type={viewMode === '2d' ? 'primary' : 'default'} onClick={() => setViewMode('2d')}>
          2D
        </Button>
        <Button size="small" type={viewMode === '3d' ? 'primary' : 'default'} onClick={() => setViewMode('3d')}>
          3D
        </Button>
        <Button size="small" type={viewMode === 'split' ? 'primary' : 'default'} onClick={() => setViewMode('split')}>
          Split
        </Button>
        <Button
          size="small"
          type={operatingMode === 'simulation' ? 'primary' : 'default'}
          onClick={() => setOperatingMode('simulation')}
        >
          Sim Mode
        </Button>
        <Button
          size="small"
          type={operatingMode === 'emulation' ? 'primary' : 'default'}
          onClick={() => setOperatingMode('emulation')}
        >
          Emulation
        </Button>
        <Button
          size="small"
          type={operatingMode === 'replay' ? 'primary' : 'default'}
          onClick={() => {
            setOperatingMode('replay')
            replayEngine.load(snapshot.eventLog)
            replayEngine.play(5)
          }}
        >
          Replay
        </Button>
        <Button
          size="small"
          onClick={() => {
            const withIndustrial = {
              ...document,
              industrial: industrialRuntime.exportSlice(),
            }
            useProjectStore.getState().setDocument(withIndustrial)
            saveProject(withIndustrial)
          }}
        >
          Save
        </Button>
        <Button
          size="small"
          onClick={() => {
            const loaded = loadProject()
            if (loaded) {
              setDocument(loaded)
              deviceRegistry.loadFromProject(loaded)
              industrialRuntime.bootstrapFromProject(loaded)
            } else {
              setError('No saved project in LocalStorage')
            }
          }}
        >
          Load
        </Button>
        <Button
          size="small"
          onClick={() =>
            exportProject({
              ...document,
              industrial: industrialRuntime.exportSlice(),
            })
          }
        >
          Export
        </Button>
        <Button
          size="small"
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
                const imported = await importProject(file)
                setDocument(imported)
                deviceRegistry.loadFromProject(imported)
                industrialRuntime.bootstrapFromProject(imported)
              } catch (error) {
                setError(error instanceof Error ? error.message : 'Import failed')
              }
            }
            input.click()
          }}
        >
          Import
        </Button>
        <Button size="small" onClick={undo}>
          Undo
        </Button>
        <Button size="small" onClick={redo}>
          Redo
        </Button>
        <Button size="small" onClick={duplicateSelected}>
          Duplicate
        </Button>
        <Button size="small" danger onClick={removeSelected}>
          Delete
        </Button>
        <span className="toolbar-sep" />
        <Button
          size="small"
          type="primary"
          onClick={() => {
            if (!validateOrError(document)) {
              return
            }
            simulationRuntime.start(document, revision, speed)
          }}
        >
          Start
        </Button>
        <Button size="small" onClick={() => simulationRuntime.pause()}>
          Pause
        </Button>
        <Button size="small" onClick={() => simulationRuntime.reset(document, revision)}>
          Reset
        </Button>
        <Button size="small" onClick={() => simulationRuntime.step(document, revision)}>
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
            setComparison(compareAgvCounts([3, 4, 5, 6], 100))
          }}
        >
          Compare 3-6 AGVs
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
              })),
            )
          }}
        >
          Run Experiment
        </Button>
      </Space>
      <Typography.Text className="toolbar-status" type="secondary">
        v0.3 · {viewMode.toUpperCase()} · {operatingMode.toUpperCase()} ·{' '}
        {status === SimulationStatus.Idle ? 'IDLE' : status.toUpperCase()}
      </Typography.Text>
    </header>
  )
}
