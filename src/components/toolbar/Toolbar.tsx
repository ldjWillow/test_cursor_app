import { Button, Dropdown, Input, Select, Space, Tooltip, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useTranslation } from 'react-i18next'
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
import {
  operatingModeLabel,
  simulationStatusLabel,
  translateValidationMessage,
  viewModeLabel,
} from '../../i18n/statusLabels.ts'
import { formatSimClock } from '../../utils/formatters.ts'
import { persistLocale, type AppLocale } from '../../i18n/index.ts'

const SPEEDS: SimulationSpeed[] = [1, 5, 10, 50]

export default function Toolbar() {
  const { t, i18n } = useTranslation()
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

  const validateOrError = (): boolean => {
    const issues = modelValidator.validate(document)
    useSimulationStore.getState().setValidationErrors(issues.map((issue) => translateValidationMessage(issue, t)))
    if (issues.length > 0) {
      useSimulationStore.getState().setError(
        t('messages.validationFailed', { message: translateValidationMessage(issues[0]!, t) }),
      )
      return false
    }
    useSimulationStore.getState().setError(undefined)
    return true
  }

  const scenarioItems: MenuProps['items'] = [
    { key: 'empty', label: t('toolbar.scenarioEmpty') },
    { key: 'conveyor', label: t('toolbar.scenarioConveyor') },
    { key: 'agv', label: t('toolbar.scenarioAgv') },
    { key: 'asrs', label: t('toolbar.scenarioAsrs') },
    { key: 'demo', label: t('toolbar.scenarioDemo') },
    { key: 'standard', label: t('toolbar.scenarioStandard') },
  ]

  const setLocale = (locale: AppLocale) => {
    void i18n.changeLanguage(locale)
    persistLocale(locale)
  }

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <div className="brand-block">
          <span className="brand-name">{t('app.brand')}</span>
          <span className="brand-sub">{t('app.brandSubtitle')}</span>
        </div>
        <Input
          size="small"
          className="project-name-input"
          value={document.project.name}
          onChange={(event) => useProjectStore.getState().setProjectName(event.target.value)}
        />
      </div>
      <Space size={4} wrap className="toolbar-actions">
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
            },
          }}
        >
          <Button size="small">{t('toolbar.new')}</Button>
        </Dropdown>
        <span className="toolbar-sep" />
        <Button size="small" type={viewMode === '2d' ? 'primary' : 'default'} onClick={() => setViewMode('2d')}>
          {t('toolbar.view2d')}
        </Button>
        <Button size="small" type={viewMode === '3d' ? 'primary' : 'default'} onClick={() => setViewMode('3d')}>
          {t('toolbar.view3d')}
        </Button>
        <Button size="small" type={viewMode === 'split' ? 'primary' : 'default'} onClick={() => setViewMode('split')}>
          {t('toolbar.viewSplit')}
        </Button>
        <span className="toolbar-sep" />
        <Button
          size="small"
          type={operatingMode === 'simulation' ? 'primary' : 'default'}
          onClick={() => setOperatingMode('simulation')}
        >
          {t('toolbar.modeSimulation')}
        </Button>
        <Button
          size="small"
          type={operatingMode === 'emulation' ? 'primary' : 'default'}
          onClick={() => setOperatingMode('emulation')}
        >
          {t('toolbar.modeEmulation')}
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
          {t('toolbar.modeReplay')}
        </Button>
        <span className="toolbar-sep" />
        <Button
          size="small"
          onClick={() => {
            saveProject(document)
          }}
        >
          {t('toolbar.save')}
        </Button>
        <Button
          size="small"
          onClick={() => {
            const loaded = loadProject()
            if (loaded) {
              setDocument(loaded)
              deviceRegistry.loadFromProject(loaded)
            } else {
              setError(t('messages.noSavedProject'))
            }
          }}
        >
          {t('toolbar.load')}
        </Button>
        <Button size="small" onClick={() => exportProject(document)}>
          {t('toolbar.export')}
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
              } catch (error) {
                const message =
                  error instanceof Error && error.message === 'INVALID_PROJECT_JSON'
                    ? t('messages.importFailed')
                    : error instanceof Error
                      ? error.message
                      : t('messages.importFailed')
                setError(message)
              }
            }
            input.click()
          }}
        >
          {t('toolbar.import')}
        </Button>
        <Button size="small" onClick={undo}>
          {t('toolbar.undo')}
        </Button>
        <Button size="small" onClick={redo}>
          {t('toolbar.redo')}
        </Button>
        <Button size="small" onClick={duplicateSelected}>
          {t('toolbar.duplicate')}
        </Button>
        <Button size="small" danger onClick={removeSelected}>
          {t('toolbar.delete')}
        </Button>
        <span className="toolbar-sep" />
        <Button
          size="small"
          type="primary"
          onClick={() => {
            if (!validateOrError()) {
              return
            }
            simulationRuntime.start(document, revision, speed)
          }}
        >
          {status === SimulationStatus.Paused ? t('toolbar.continue') : t('toolbar.start')}
        </Button>
        <Button size="small" onClick={() => simulationRuntime.pause()}>
          {t('toolbar.pause')}
        </Button>
        <Button size="small" onClick={() => simulationRuntime.reset(document, revision)}>
          {t('toolbar.reset')}
        </Button>
        <Button size="small" onClick={() => simulationRuntime.step(document, revision)}>
          {t('toolbar.step')}
        </Button>
        <span className="speed-group">
          <span className="speed-label">{t('toolbar.speedLabel')}</span>
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
              {t('toolbar.speedValue', { value })}
            </Button>
          ))}
        </span>
        <Button
          size="small"
          onClick={() => {
            if (!validateOrError()) {
              return
            }
            simulationRuntime.runToEnd(document, revision)
          }}
        >
          {t('toolbar.runToEnd')}
        </Button>
        <Button
          size="small"
          onClick={() => {
            if (!validateOrError()) {
              return
            }
            setComparison(compareAgvCounts([3, 4, 5, 6], 100))
          }}
        >
          {t('toolbar.compareAgvs')}
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            if (!validateOrError()) {
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
          {t('toolbar.runExperiment')}
        </Button>
      </Space>
      <div className="toolbar-right">
        <div className={`run-status run-status-${status}`}>
          <strong>{simulationStatusLabel(status, t)}</strong>
          <span>|</span>
          <span>
            {t('kpi.simulationTime')} {formatSimClock(snapshot.time)}
          </span>
          <span>|</span>
          <span>{t('toolbar.speedValue', { value: speed })}</span>
        </div>
        <Select
          size="small"
          className="locale-select"
          value={i18n.language.startsWith('en') ? 'en-US' : 'zh-CN'}
          options={[
            { value: 'zh-CN', label: t('app.zh') },
            { value: 'en-US', label: t('app.en') },
          ]}
          onChange={(value) => setLocale(value as AppLocale)}
        />
        <Tooltip title={`${viewModeLabel(viewMode, t)} · ${operatingModeLabel(operatingMode, t)}`}>
          <Typography.Text className="toolbar-status" type="secondary">
            v0.3
          </Typography.Text>
        </Tooltip>
      </div>
    </header>
  )
}
