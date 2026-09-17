import { useTranslation } from 'react-i18next'
import { useUiStore } from '../../store/uiStore.ts'
import type { AppModule } from '../../store/uiStore.ts'
import { useDigitalTwinStore } from '../../store/digitalTwinStore.ts'

const MODULES: AppModule[] = [
  'overview',
  'model',
  'simulation',
  'experiment',
  'twin3d',
  'commissioning',
  'connections',
  'signals',
  'protocol',
  'eventLog',
  'replay',
]

function moduleLabelKey(module: AppModule): string {
  switch (module) {
    case 'overview':
      return 'nav.dashboard'
    case 'experiment':
      return 'nav.experiments'
    case 'eventLog':
      return 'nav.eventLog'
    default:
      return `nav.${module}`
  }
}

export default function ModuleNav() {
  const { t } = useTranslation()
  const activeModule = useUiStore((state) => state.activeModule)
  const setActiveModule = useUiStore((state) => state.setActiveModule)
  const setViewMode = useDigitalTwinStore((state) => state.setViewMode)
  const setOperatingMode = useDigitalTwinStore((state) => state.setOperatingMode)

  const onSelect = (module: AppModule) => {
    setActiveModule(module)
    if (module === 'twin3d') {
      setViewMode('3d')
    } else if (module === 'model') {
      setViewMode('2d')
    }
    if (module === 'replay') {
      setOperatingMode('replay')
    } else if (module === 'commissioning') {
      setOperatingMode('emulation')
    }
  }

  return (
    <nav className="module-nav" aria-label="modules">
      {MODULES.map((module) => (
        <button
          key={module}
          type="button"
          className={`module-nav-item${activeModule === module ? ' active' : ''}`}
          onClick={() => onSelect(module)}
        >
          {t(moduleLabelKey(module), {
            defaultValue:
              module === 'eventLog'
                ? '事件日志'
                : module === 'overview'
                  ? '总览'
                  : module,
          })}
        </button>
      ))}
    </nav>
  )
}
