import { Button, Dropdown, Input, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { SimulationSpeed, SimulationStatus } from '../../types/index.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { simulationRuntime } from '../../simulation/SimulationRuntime.ts'
import { exportProject, importProject, loadProject, saveProject } from '../../persistence/projectPersistence.ts'
import { agvScenario, asrsScenario, conveyorScenario, emptyProject } from '../../domain/base/scenarios.ts'
import { compareAgvCounts } from '../../simulation/experiments.ts'

const SPEEDS: SimulationSpeed[] = [1, 5, 10, 50]

export default function Toolbar() {
  const document = useProjectStore((state) => state.document)
  const revision = useProjectStore((state) => state.revision)
  const setDocument = useProjectStore((state) => state.setDocument)
  const removeSelected = useProjectStore((state) => state.removeSelected)
  const speed = useSimulationStore((state) => state.speed)
  const status = useSimulationStore((state) => state.status)
  const setSpeed = useSimulationStore((state) => state.setSpeed)
  const setComparison = useSimulationStore((state) => state.setComparison)
  const setError = useSimulationStore((state) => state.setError)

  const scenarioItems: MenuProps['items'] = [
    { key: 'empty', label: 'Empty project' },
    { key: 'conveyor', label: 'Source → Conveyor → Sink' },
    { key: 'agv', label: 'AGV A → N1 → N2 → B' },
    { key: 'asrs', label: 'Rack + Stacker inbound' },
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
      <Space size={6} wrap>
        <Dropdown
          menu={{
            items: scenarioItems,
            onClick: ({ key }) => {
              if (key === 'conveyor') setDocument(conveyorScenario())
              if (key === 'agv') setDocument(agvScenario(3, 100))
              if (key === 'asrs') setDocument(asrsScenario())
              if (key === 'empty') setDocument(emptyProject('WarehouseSim'))
              simulationRuntime.reset(useProjectStore.getState().document, useProjectStore.getState().revision)
            },
          }}
        >
          <Button size="small">New</Button>
        </Dropdown>
        <Button size="small" onClick={() => saveProject(document)}>
          Save
        </Button>
        <Button
          size="small"
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
        <Button size="small" danger onClick={removeSelected}>
          Delete
        </Button>
        <span className="toolbar-sep" />
        <Button
          size="small"
          type="primary"
          onClick={() => simulationRuntime.start(document, revision, speed)}
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
          onClick={() => simulationRuntime.runToEnd(document, revision)}
        >
          Run to end
        </Button>
        <Button
          size="small"
          onClick={() => setComparison(compareAgvCounts([3, 4, 5, 6], 100))}
        >
          Compare 3-6 AGVs
        </Button>
      </Space>
      <Typography.Text className="toolbar-status" type="secondary">
        {status === SimulationStatus.Idle ? 'IDLE' : status.toUpperCase()}
      </Typography.Text>
    </header>
  )
}
