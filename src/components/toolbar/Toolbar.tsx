import { useState } from 'react'
import type { ComponentProps } from 'react'
import { Button, Dropdown, Input, Select, Space, Tooltip, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useTranslation } from 'react-i18next'
import { SimulationSpeed, SimulationStatus } from '../../types/index.ts'
import { useProjectStore } from '../../store/projectStore.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'
import { useUiStore } from '../../store/uiStore.ts'
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
import { experimentManager } from '../../experiment/ExperimentManager.ts'
import { modelValidator } from '../../validation/ModelValidator.ts'
import { deviceRegistry } from '../../virtual/DeviceRegistry.ts'
import { replayController } from '../../replay/ReplayController.ts'
import { buildDigitalTwinState } from '../../twin/fromSnapshot.ts'
import {
  workerCompareAgvs,
  workerRunExperiment,
  workerRunToEnd,
} from '../../workers/experimentClient.ts'
import { isModelEditable, modelLockMessageKey } from '../../utils/modelLock.ts'
import {
  operatingModeLabel,
  simulationStatusLabel,
  translateValidationMessage,
  viewModeLabel,
} from '../../i18n/statusLabels.ts'
import { formatSimClock } from '../../utils/formatters.ts'
import { persistLocale, type AppLocale } from '../../i18n/index.ts'

const SPEEDS: SimulationSpeed[] = [1, 5, 10, 50]

function mapWorkerError(error: unknown, t: (key: string, options?: Record<string, string>) => string): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'WORKER_BUSY') {
    return t('messages.workerBusy', { defaultValue: '后台任务忙碌中，请稍后再试。' })
  }
  if (message === 'WORKER_TIMEOUT') {
    return t('messages.workerTimeout', { defaultValue: '后台任务超时，请缩小实验规模后重试。' })
  }
  if (message.startsWith('MAX_EVENTS')) {
    return t('messages.maxEvents', { defaultValue: '事件数量超过上限，请缩短仿真或降低生成频率。' })
  }
  return message
}

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
  const [batchBusy, setBatchBusy] = useState(false)

  const modelEditable = isModelEditable(status)
  const lockTip = modelEditable ? undefined : t(modelLockMessageKey())

  const LockedButton = ({
    children,
    disabled,
    ...rest
  }: ComponentProps<typeof Button>) => {
    const button = (
      <Button {...rest} disabled={Boolean(disabled) || !modelEditable}>
        {children}
      </Button>
    )
    if (!modelEditable) {
      return (
        <Tooltip title={lockTip}>
          <span style={{ display: 'inline-flex' }}>{button}</span>
        </Tooltip>
      )
    }
    return button
  }

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

  const confirmDelete = () => {
    if (window.confirm(t('messages.confirmDelete'))) {
      removeSelected()
    }
  }

  const confirmReset = () => {
    if (window.confirm(t('messages.confirmReset'))) {
      simulationRuntime.reset(document, revision)
    }
  }

  const enterReplayMode = () => {
    const loaded = replayController.loadFromSnapshot(snapshot)
    if (!loaded) {
      setError(t('replay.empty', { defaultValue: '暂无回放数据，请先运行仿真生成事件日志。' }))
      return
    }
    setOperatingMode('replay')
    useUiStore.getState().setActiveModule('replay')
  }

  const runToEndBatch = async () => {
    if (!validateOrError() || batchBusy) {
      return
    }
    setBatchBusy(true)
    try {
      const result = await workerRunToEnd(document, (progress, message) => {
        setError(
          t('batch.progress', {
            defaultValue: '后台进度 {{percent}}% — {{message}}',
            percent: String(Math.round(progress * 100)),
            message,
          }),
        )
      })
      useSimulationStore.getState().setSnapshot(result)
      setOperatingMode('simulation')
      const twin = buildDigitalTwinState({
        snapshot: result,
        project: useProjectStore.getState().document,
        operatingMode: 'simulation',
        revision: Date.now(),
      })
      useDigitalTwinStore.getState().setTwin(twin)
      setError(undefined)
    } catch (error) {
      setError(mapWorkerError(error, t))
    } finally {
      setBatchBusy(false)
    }
  }

  const compareAgvsBatch = async () => {
    if (!validateOrError() || batchBusy) {
      return
    }
    setBatchBusy(true)
    try {
      const rows = await workerCompareAgvs([3, 4, 5, 6], 100, (progress, message) => {
        setError(
          t('batch.progress', {
            defaultValue: '后台进度 {{percent}}% — {{message}}',
            percent: String(Math.round(progress * 100)),
            message,
          }),
        )
      })
      setComparison(rows)
      setError(undefined)
    } catch (error) {
      setError(mapWorkerError(error, t))
    } finally {
      setBatchBusy(false)
    }
  }

  const runExperimentBatch = async () => {
    if (!validateOrError() || batchBusy) {
      return
    }
    setBatchBusy(true)
    try {
      const { results, summaries } = await workerRunExperiment(
        document,
        [3, 4, 5, 6],
        1,
        document.simulationConfig.seed,
        (progress, message) => {
          setError(
            t('batch.progress', {
              defaultValue: '后台进度 {{percent}}% — {{message}}',
              percent: String(Math.round(progress * 100)),
              message,
            }),
          )
        },
      )
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
      setError(undefined)
    } catch (error) {
      setError(mapWorkerError(error, t))
    } finally {
      setBatchBusy(false)
    }
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
          disabled={!modelEditable}
          onChange={(event) => useProjectStore.getState().setProjectName(event.target.value)}
        />
      </div>
      <Space size={4} wrap className="toolbar-actions">
        {/* project */}
        <Tooltip title={lockTip}>
          <Dropdown
            disabled={!modelEditable}
            menu={{
              items: scenarioItems,
              onClick: ({ key }) => {
                if (!isModelEditable()) {
                  return
                }
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
            <Button size="small" disabled={!modelEditable}>
              {t('toolbar.new')}
            </Button>
          </Dropdown>
        </Tooltip>
        <Button
          size="small"
          onClick={() => {
            saveProject(document)
          }}
        >
          {t('toolbar.save')}
        </Button>
        <LockedButton
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
        </LockedButton>
        <Button size="small" onClick={() => exportProject(document)}>
          {t('toolbar.export')}
        </Button>
        <LockedButton
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
        </LockedButton>

        <span className="toolbar-sep" />
        {/* view */}
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
        {/* mode */}
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
          onClick={enterReplayMode}
        >
          {t('toolbar.modeReplay')}
        </Button>

        <span className="toolbar-sep" />
        {/* edit */}
        <LockedButton size="small" onClick={undo}>
          {t('toolbar.undo')}
        </LockedButton>
        <LockedButton size="small" onClick={redo}>
          {t('toolbar.redo')}
        </LockedButton>
        <LockedButton size="small" onClick={duplicateSelected}>
          {t('toolbar.duplicate')}
        </LockedButton>
        <LockedButton size="small" danger onClick={confirmDelete}>
          {t('toolbar.delete')}
        </LockedButton>

        <span className="toolbar-sep" />
        {/* sim */}
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
        <Button size="small" onClick={confirmReset}>
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

        <span className="toolbar-sep" />
        {/* experiment */}
        <Button size="small" loading={batchBusy} disabled={batchBusy} onClick={() => void runToEndBatch()}>
          {t('toolbar.runToEnd')}
        </Button>
        <Button size="small" loading={batchBusy} disabled={batchBusy} onClick={() => void compareAgvsBatch()}>
          {t('toolbar.compareAgvs')}
        </Button>
        <Button
          size="small"
          type="primary"
          loading={batchBusy}
          disabled={batchBusy}
          onClick={() => void runExperimentBatch()}
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
