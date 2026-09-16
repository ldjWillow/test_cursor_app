import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import type { Group, InstancedMesh } from 'three'
import { Color, Object3D } from 'three'
import { useDigitalTwinStore } from '../store/digitalTwinStore.ts'
import { defaultCoordinateTransformer } from '../coords/CoordinateTransformer.ts'
import type {
  AgvRuntimeState,
  ConveyorRuntimeState,
  RackRuntimeState,
  StackerRuntimeState,
  StationRuntimeState,
} from '../twin/types.ts'
import { useProjectStore } from '../store/projectStore.ts'

const dummy = new Object3D()

function Floor({ width = 80, depth = 60 }: { width?: number; depth?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, -0.01, depth / 2]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color="#1a2330" />
    </mesh>
  )
}

function AgvMesh({ state, selected }: { state: AgvRuntimeState; selected: boolean }) {
  const ref = useRef<Group>(null)
  const three = defaultCoordinateTransformer.worldToThree({ x: state.x, y: state.y, z: state.z })
  useFrame(() => {
    if (!ref.current) {
      return
    }
    // Visual interpolation only — target pose comes from Digital Twin State.
    ref.current.position.x += (three.x - ref.current.position.x) * 0.2
    ref.current.position.y += (three.y - ref.current.position.y) * 0.2
    ref.current.position.z += (three.z - ref.current.position.z) * 0.2
    ref.current.rotation.y += (state.rotation - ref.current.rotation.y) * 0.2
  })
  const color =
    state.status === 'FAULT' ? '#f07178' : state.status === 'WAITING_FOR_ROUTE' ? '#f5a524' : '#22d3ee'
  return (
    <group
      ref={ref}
      position={[three.x, three.y, three.z]}
      onClick={(event) => {
        event.stopPropagation()
        useDigitalTwinStore.getState().selectDevice(state.id)
        useProjectStore.getState().setSelection(state.id, 'device')
      }}
    >
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.35, 0.6]} />
        <meshStandardMaterial color={color} emissive={selected ? '#3d8bfd' : '#000'} emissiveIntensity={selected ? 0.4 : 0} />
      </mesh>
      <Html distanceFactor={18} position={[0, 0.6, 0]}>
        <div className="twin3d-label">{state.name}</div>
      </Html>
    </group>
  )
}

function ConveyorMesh({ state, selected }: { state: ConveyorRuntimeState; selected: boolean }) {
  const three = defaultCoordinateTransformer.worldToThree({ x: state.x, y: state.y, z: state.z })
  const color = state.fault ? '#f07178' : state.running ? '#f5a524' : '#64748b'
  return (
    <mesh
      position={[three.x, 0.15, three.z]}
      onClick={(event) => {
        event.stopPropagation()
        useDigitalTwinStore.getState().selectDevice(state.id)
        useProjectStore.getState().setSelection(state.id, 'device')
      }}
    >
      <boxGeometry args={[Math.max(2, state.length * 0.4), 0.2, 0.8]} />
      <meshStandardMaterial color={color} emissive={selected ? '#3d8bfd' : '#000'} emissiveIntensity={selected ? 0.35 : 0} />
    </mesh>
  )
}

function StackerMesh({ state, selected }: { state: StackerRuntimeState; selected: boolean }) {
  const three = defaultCoordinateTransformer.worldToThree({ x: state.x, y: state.y, z: 0 })
  return (
    <group position={[three.x + state.horizontalOffset * 0.05, 0, three.z]}>
      <mesh
        position={[0, 1.2, 0]}
        onClick={(event) => {
          event.stopPropagation()
          useDigitalTwinStore.getState().selectDevice(state.id)
          useProjectStore.getState().setSelection(state.id, 'device')
        }}
      >
        <boxGeometry args={[0.4, 2.4, 0.4]} />
        <meshStandardMaterial color={selected ? '#fb923c' : '#ea580c'} />
      </mesh>
      <mesh position={[0, 0.4 + state.liftHeight * 0.15, state.forkPosition]}>
        <boxGeometry args={[0.8, 0.12, 0.5]} />
        <meshStandardMaterial color="#fdba74" />
      </mesh>
    </group>
  )
}

function RackInstances({ state, selected }: { state: RackRuntimeState; selected: boolean }) {
  const meshRef = useRef<InstancedMesh>(null)
  const three = defaultCoordinateTransformer.worldToThree({ x: state.x, y: state.y, z: 0 })
  const occupied = useMemo(() => new Color('#c084fc'), [])
  const empty = useMemo(() => new Color('#334155'), [])
  const count = Math.max(1, state.locations.length || state.rows * state.columns * state.levels)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }
    let index = 0
    const locations =
      state.locations.length > 0
        ? state.locations
        : Array.from({ length: count }, (_, i) => ({
            row: 0,
            column: i % state.columns,
            level: Math.floor(i / state.columns) % state.levels,
            occupied: false,
          }))
    for (const location of locations) {
      dummy.position.set(
        three.x + location.column * 0.45,
        0.25 + location.level * 0.45,
        three.z + location.row * 0.45,
      )
      dummy.scale.set(0.35, 0.35, 0.35)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, location.occupied ? occupied : empty)
      index += 1
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }, [state, three.x, three.z, count, occupied, empty])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      onClick={(event) => {
        event.stopPropagation()
        useDigitalTwinStore.getState().selectDevice(state.id)
        useProjectStore.getState().setSelection(state.id, 'device')
      }}
    >
      <boxGeometry />
      <meshStandardMaterial color={selected ? '#e9d5ff' : '#64748b'} />
    </instancedMesh>
  )
}

function StationMesh({ state, selected }: { state: StationRuntimeState; selected: boolean }) {
  const three = defaultCoordinateTransformer.worldToThree({ x: state.x, y: state.y, z: 0 })
  const color =
    state.type === 'source' ? '#3ecf8e' : state.type === 'sink' ? '#f07178' : state.type === 'path-node' ? '#94a3b8' : '#6ea8fe'
  return (
    <mesh
      position={[three.x, state.type === 'path-node' ? 0.15 : 0.35, three.z]}
      onClick={(event) => {
        event.stopPropagation()
        useDigitalTwinStore.getState().selectDevice(state.id)
        useProjectStore.getState().setSelection(state.id, 'device')
      }}
    >
      <boxGeometry args={state.type === 'path-node' ? [0.4, 0.2, 0.4] : [1.1, 0.7, 1.1]} />
      <meshStandardMaterial color={color} emissive={selected ? '#3d8bfd' : '#000'} emissiveIntensity={selected ? 0.35 : 0} />
    </mesh>
  )
}

function CameraRig() {
  const controls = useThree((state) => state.controls) as { target?: { set: (x: number, y: number, z: number) => void }; update?: () => void } | null
  const selectedId = useDigitalTwinStore((state) => state.highlightedDeviceId ?? state.twin.selectedDeviceId)
  const twin = useDigitalTwinStore((state) => state.twin)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    if (!selectedId) {
      return
    }
    const device = twin.devices[selectedId]
    if (!device || !('x' in device)) {
      return
    }
    const three = defaultCoordinateTransformer.worldToThree({ x: device.x, y: device.y, z: 0 })
    camera.position.set(three.x + 8, 10, three.z + 8)
    controls?.target?.set(three.x, 0.5, three.z)
    controls?.update?.()
  }, [selectedId, twin.devices, camera, controls])

  return null
}

function SceneContent() {
  const twin = useDigitalTwinStore((state) => state.twin)
  const selectedId = useDigitalTwinStore((state) => state.highlightedDeviceId ?? state.twin.selectedDeviceId)
  const devices = Object.values(twin.devices) as Array<
    AgvRuntimeState | ConveyorRuntimeState | StackerRuntimeState | RackRuntimeState | StationRuntimeState
  >

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[30, 40, 20]} intensity={1.1} castShadow />
      <Floor />
      <gridHelper args={[100, 50, '#334155', '#1f2937']} position={[25, 0, 20]} />
      {devices.map((device) => {
        const selected = device.id === selectedId
        if (device.type === 'agv') {
          return <AgvMesh key={device.id} state={device} selected={selected} />
        }
        if (device.type === 'conveyor') {
          return <ConveyorMesh key={device.id} state={device} selected={selected} />
        }
        if (device.type === 'stacker') {
          return <StackerMesh key={device.id} state={device} selected={selected} />
        }
        if (device.type === 'rack') {
          return <RackInstances key={device.id} state={device} selected={selected} />
        }
        return <StationMesh key={device.id} state={device} selected={selected} />
      })}
      <OrbitControls makeDefault />
      <CameraRig />
    </>
  )
}

export default function WarehouseScene3D() {
  return (
    <div className="canvas3d-shell">
      <Canvas shadows camera={{ position: [18, 16, 22], fov: 45 }}>
        <SceneContent />
      </Canvas>
      <div className="camera-toolbar">
        <button type="button" onClick={() => useDigitalTwinStore.getState().selectDevice(undefined)}>
          Fit / Clear
        </button>
      </div>
    </div>
  )
}