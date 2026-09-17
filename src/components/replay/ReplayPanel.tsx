import { useEffect, useState } from 'react'
import { Button, InputNumber, Slider, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import { replayController } from '../../replay/ReplayController.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { formatSeconds } from '../../utils/formatters.ts'

export default function ReplayPanel() {
  const { t } = useTranslation()
  const snapshot = useSimulationStore((state) => state.snapshot)
  const [, setTick] = useState(0)
  const hasEntries = replayController.hasEntries() || snapshot.eventLog.length > 0
  const currentTime = replayController.getCurrentTime()
  const duration = Math.max(replayController.getDuration(), snapshot.eventLog.at(-1)?.simulationTime ?? 0)
  const status = replayController.getStatus()

  useEffect(() => {
    if (snapshot.eventLog.length > 0 && !replayController.hasEntries()) {
      replayController.loadFromSnapshot(snapshot)
    }
  }, [snapshot])

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 200)
    return () => window.clearInterval(timer)
  }, [])

  if (!hasEntries) {
    return (
      <div className="module-panel replay-panel">
        <div className="panel-title">{t('nav.replay')}</div>
        <div className="panel-hint">
          {t('replay.empty', { defaultValue: '暂无回放数据，请先运行仿真生成事件日志。' })}
        </div>
      </div>
    )
  }

  return (
    <div className="module-panel replay-panel">
      <div className="sim-panel-header">
        <div className="panel-title">{t('nav.replay')}</div>
        <span className="panel-hint">
          {formatSeconds(currentTime)} / {formatSeconds(duration)} · {status}
        </span>
      </div>
      <Space wrap size={8} style={{ marginBottom: 10 }}>
        <Button size="small" type="primary" onClick={() => replayController.play()}>
          {t('replay.play', { defaultValue: '播放' })}
        </Button>
        <Button size="small" onClick={() => replayController.pause()}>
          {t('replay.pause', { defaultValue: '暂停' })}
        </Button>
        <Button size="small" onClick={() => replayController.stop()}>
          {t('replay.stop', { defaultValue: '停止' })}
        </Button>
        <Button size="small" onClick={() => replayController.step()}>
          {t('replay.step', { defaultValue: '单步' })}
        </Button>
        <span className="panel-hint">{t('replay.speed', { defaultValue: '倍率' })}</span>
        <InputNumber
          size="small"
          min={0.25}
          max={50}
          step={0.25}
          defaultValue={1}
          onChange={(value) => {
            if (typeof value === 'number') {
              replayController.setSpeed(value)
            }
          }}
        />
      </Space>
      <Slider
        min={0}
        max={Math.max(duration, 0.001)}
        step={0.01}
        value={currentTime}
        tooltip={{ formatter: (value) => formatSeconds(value ?? 0) }}
        onChange={(value) => replayController.seek(value)}
      />
    </div>
  )
}
