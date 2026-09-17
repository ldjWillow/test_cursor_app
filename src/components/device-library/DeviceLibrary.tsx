import { Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import { DeviceType } from '../../types/index.ts'
import type { DeviceType as DeviceTypeName } from '../../types/index.ts'
import { DEVICE_TEMPLATES } from '../../domain/base/templates.ts'
import { deviceTypeLabel } from '../../i18n/statusLabels.ts'
import { useSimulationStore } from '../../store/simulationStore.ts'
import { isModelEditable, modelLockMessageKey } from '../../utils/modelLock.ts'

const CATEGORIES: Array<{
  key: 'basic' | 'logistics' | 'storage' | 'agv' | 'control'
  types: DeviceTypeName[]
}> = [
  { key: 'basic', types: [DeviceType.Source, DeviceType.Sink, DeviceType.Station] },
  { key: 'logistics', types: [DeviceType.Conveyor] },
  { key: 'storage', types: [DeviceType.Rack, DeviceType.Stacker] },
  { key: 'agv', types: [DeviceType.Agv, DeviceType.Charger, DeviceType.PathNode] },
]

const TEMPLATE_I18N: Record<string, { name: string; description: string }> = {
  'tpl-standard-agv': {
    name: 'deviceLibrary.template.standardAgv.name',
    description: 'deviceLibrary.template.standardAgv.description',
  },
  'tpl-heavy-agv': {
    name: 'deviceLibrary.template.heavyAgv.name',
    description: 'deviceLibrary.template.heavyAgv.description',
  },
  'tpl-standard-conveyor': {
    name: 'deviceLibrary.template.standardConveyor.name',
    description: 'deviceLibrary.template.standardConveyor.description',
  },
}

export default function DeviceLibrary() {
  const { t } = useTranslation()
  const status = useSimulationStore((state) => state.status)
  const editable = isModelEditable(status)
  const lockTip = editable ? undefined : t(modelLockMessageKey())

  return (
    <aside className={`panel device-library${editable ? '' : ' device-library-locked'}`}>
      <div className="panel-title">{t('deviceLibrary.title')}</div>
      <p className="panel-hint">{editable ? t('deviceLibrary.hint') : lockTip}</p>
      {CATEGORIES.map((category) => (
        <div key={category.key} className="library-category">
          <div className="library-category-title">{t(`deviceLibrary.categories.${category.key}`)}</div>
          <div className="library-list">
            {category.types.map((type) => {
              const item = (
                <div
                  key={type}
                  className={`library-item library-${type}${editable ? '' : ' library-item-disabled'}`}
                  draggable={editable}
                  onDragStart={(event) => {
                    if (!editable) {
                      event.preventDefault()
                      return
                    }
                    event.dataTransfer.setData('application/warehousesim', type)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                >
                  <span className="library-swatch" />
                  <span>{deviceTypeLabel(type, t)}</span>
                </div>
              )
              return editable ? (
                item
              ) : (
                <Tooltip key={type} title={lockTip}>
                  {item}
                </Tooltip>
              )
            })}
          </div>
        </div>
      ))}
      <div className="panel-title" style={{ marginTop: 12 }}>
        {t('deviceLibrary.templates')}
      </div>
      <div className="library-list">
        {DEVICE_TEMPLATES.map((template) => {
          const keys = TEMPLATE_I18N[template.id]
          const name = keys ? t(keys.name) : template.name
          const description = keys ? t(keys.description) : template.description
          const item = (
            <div
              key={template.id}
              className={`library-item library-${template.type}${editable ? '' : ' library-item-disabled'}`}
              draggable={editable}
              title={editable ? description : lockTip}
              onDragStart={(event) => {
                if (!editable) {
                  event.preventDefault()
                  return
                }
                event.dataTransfer.setData('application/warehousesim', template.type)
                event.dataTransfer.setData('application/warehousesim-template', template.id)
                event.dataTransfer.effectAllowed = 'move'
              }}
            >
              <span className="library-swatch" />
              <span>
                {name}
                <br />
                <small className="panel-hint">{description}</small>
              </span>
            </div>
          )
          return editable ? (
            item
          ) : (
            <Tooltip key={template.id} title={lockTip}>
              {item}
            </Tooltip>
          )
        })}
      </div>
    </aside>
  )
}
