import { Suspense, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import Chick, { DEFAULT_ROAM, type Roam } from './Chick'
import Stage, { STAGE_LAYER } from './RoomStage'
import type { Look } from './look'
import { MOODS } from '../state/logic'

type Props = {
  look: Look
  animate: boolean
  /** 枠いっぱいに広げる（ダッシュボードの背景ステージ用）。
      枠の大きさに合わせてカメラを引き、歩き回れる範囲もそのぶん広がる */
  fill?: boolean
  /** たまごを割る。ステージ0のときだけ効く（→ Chick.tsx の Egg） */
  hatching?: boolean
  /** ひよこを叩けるようにする（→ Chick.tsx の TapSparkle） */
  interactive?: boolean
}

/**
 * 1ワールド単位あたりの画素数。300px 幅の枠（カメラ距離 4.6・fov 32）での
 * 見え方をそのまま数にしたもの。枠を広げてもこの比率を保つようにカメラを
 * 引くので、同じ表示密度の枠ではひよこの大きさは変わらない。
 * 例外は、部屋の外が映るほど枠が広いとき（→ StageFit の上限）。
 */
const PX_PER_UNIT = 118
/** 枠に収める高さの下限（ワールド単位）。300px 幅の枠での見え方と同じ。
    これより枠が低いときは、大きさを保つのをあきらめて全身が入るのを優先する */
const MIN_UNITS_TALL = 2.64
/** 足元から枠の下端までの余白（ワールド単位）。影と地面のぶん */
const FLOOR_PAD = 0.9
/** カメラを床の中心より少し上に置く高さ。わずかに見下ろして床を見せる */
const CAMERA_Y = 0.45
/** 歩き回れる範囲の、枠の端からの余白。はみ出さないための取りしろ */
const EDGE_PAD = 0.9
/** 部屋のモデルの大きさ（models/stage/build.py の ROOM_W / WALL_Y / WALL_H）。
    **Blender で部屋の大きさを変えたら、ここも合わせる** */
const ROOM_HALF_W = 20
const ROOM_WALL_BACK = 3
const ROOM_WALL_TOP = 20
/** 部屋の端から、見えている範囲の端までの取りしろ（ワールド単位） */
const ROOM_PAD = 1

/**
 * 3D の置き場。カメラと照明はここで決め、キャラの中身は Chick.tsx に任せる。
 *
 * 背景は透明にしてある（`gl.alpha`）。カードの背景色や、気分に連動する
 * アクセント色（ui/useAccent.ts）がそのまま透けるようにするため。
 * 枠いっぱい（`fill`）のときだけは部屋のモデル（RoomStage.tsx）を置くので、透けない。
 */
export default function AvatarCanvas({ look, animate, fill = false, hatching, interactive }: Props) {
  return (
    <Canvas
      // **枠いっぱいのときは CSS が pointer-events を切っている**（avatar.css）。
      // 触れるようにするなら戻さないと、クリックがキャンバスに届かない
      className={`avatar avatar-3d${fill ? ' avatar-fill' : ''}${interactive ? ' avatar-interactive' : ''}`}
      // 枠いっぱいのときだけ絶対位置に。three.js の入れ物は height:100% の
      // インライン指定で来るので、CSS からは position を上書きできない。
      // 絶対位置にしておかないと高さが伝わらず、既定の 150px に潰れる
      style={fill ? { position: 'absolute', inset: 0 } : undefined}
      role="img"
      aria-label={
        look.isEgg
          ? 'アバターの状態: たまご'
          : `アバターの状態: ${look.stage}段階目、${MOODS.find((m) => m.id === look.mood)?.name ?? ''}`
      }
      // 高 DPI 端末で 2 倍までに抑える。3 倍以上にすると発熱が目に見えて増える。
      // 枠いっぱいに広げるときは画素数がそもそも多いので、さらに抑える
      dpr={fill ? [1, 1.5] : [1, 2]}
      gl={{ alpha: true, antialias: true }}
      // トーンマッピングを切る（既定は ACES フィルミック）。映画向けの曲線で、
      // 明るい色ほど灰色へ寄せる。look.ts のパステルがくすんで見えるので、
      // 指定した色をそのまま出す
      flat
      camera={{ position: [0, CAMERA_Y, 4.6], fov: 32 }}
      // 見えていない間は回さない
      frameloop="always"
    >
      {/* **光の強さは「指定した色がそのまま出る」ところに合わせてある。**
          three.js の拡散反射は明るさを π で割る（物理的な単位）ので、
          強さ1の光では色の 1/3 ほどの明るさにしかならない。素直に 1.0 前後で
          組むと、look.ts で明るい色を指定しても画面では灰色っぽく沈む。
          いちばん明るい所で 1 を少し超えるくらい（＝指定した色とほぼ同じ）に
          なるよう、環境光と主光源を合わせて π 倍ぶんまで上げている */}
      <ambientLight intensity={1.7} />
      {/* 主光源。右斜め上から当てて、丸みを出す */}
      <directionalLight position={[2.6, 4.2, 3.2]} intensity={2.0} />
      {/* 逆光。輪郭をふちどって、背景から浮かせる */}
      <directionalLight position={[-3, 2, -2.5]} intensity={0.8} color="#BBD9FF" />
      {fill ? (
        <StageFit>
          {(roam) => (
            <Chick look={look} animate={animate} roam={roam} hatching={hatching} interactive={interactive} />
          )}
        </StageFit>
      ) : (
        <group position={[0, -0.85, 0]}>
          <Chick look={look} animate={animate} roam={DEFAULT_ROAM} hatching={hatching} interactive={interactive} />
        </group>
      )}
    </Canvas>
  )
}

/**
 * 枠の大きさに合わせて、カメラの引きと地面の高さ、歩き回れる範囲を決める。
 *
 * ここを CSS では書けない。3D の「どこまで見えるか」は画素ではなく画角と
 * 距離で決まるので、枠が広くなったぶんカメラを引かないと、ひよこだけが
 * 大きくなってしまう。逆に引きさえすれば、見える床がそのまま広がる。
 */
function StageFit({ children }: { children: (roam: Roam) => ReactNode }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  // 縦の画角（fov）は固定なので、見たい高さぶんだけ後ろへ下がる
  const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360)

  // 枠に収まるワールドの大きさ。px を 1単位=PX_PER_UNIT で読み替えただけ。
  // ただし低い枠では全身が入らなくなるので、そこだけ下限で止める。
  // **上限は部屋の大きさで止める。** 大きなモニターやブラウザの縮小（Ctrl + −）で
  // 枠が px で広がると、カメラを引きすぎて部屋の外（壁の端や上）が映る。
  // そこから先はカメラを引かず、ひよこと部屋をまとめて大きく映して枠を埋める。
  // 奥の壁は原点より ROOM_WALL_BACK だけ遠いので、同じ画角でもそのぶん広く見えている
  const aspect = width / height
  const maxUnitsTall = Math.min(
    ROOM_WALL_TOP - ROOM_PAD - tanHalfFov * ROOM_WALL_BACK,
    (2 * (ROOM_HALF_W - ROOM_PAD - aspect * tanHalfFov * ROOM_WALL_BACK)) / aspect
  )
  // モバイルの部屋では少し近くから見せる。低い枠の全身フィットと部屋の上限は維持する。
  const pixelsPerUnit = width <= 760 ? 130 : PX_PER_UNIT
  const unitsTall = Math.max(Math.min(height / pixelsPerUnit, maxUnitsTall), MIN_UNITS_TALL)
  const unitsWide = unitsTall * aspect

  const cameraZ = unitsTall / 2 / tanHalfFov

  // 床は枠の下端近く（枠の中心から見た高さ）
  const floorY = -unitsTall / 2 + FLOOR_PAD

  useLayoutEffect(() => {
    // **床ではなくカメラを動かす。** 床はいつもワールドの高さ 0 に置き、枠の下端近くに
    // 来るぶんカメラを持ち上げる。ひよこの落ち影（ContactShadows）は、ぼかしの板を
    // ワールドの原点に置いて影のカメラ（床から高さ far=2 まで）で撮る作りなので、
    // 床を原点から 2 以上下げると影が毎フレーム消える（枠が高いと起きる）
    camera.position.set(0, CAMERA_Y - floorY, cameraZ)
    // 部屋は別のレイヤーに載せてある（→ RoomStage.tsx）。画面のカメラはそれも見る
    camera.layers.enable(STAGE_LAYER)
    camera.lookAt(0, -floorY, 0)
    camera.updateProjectionMatrix()
  }, [camera, cameraZ, floorY])

  // 手前（+z）に来ると画面では下がるので、奥行きは足元の余白より狭くしておく
  const roam = useMemo<Roam>(
    () => ({
      x: Math.max(DEFAULT_ROAM.x, unitsWide / 2 - EDGE_PAD),
      z: Math.max(DEFAULT_ROAM.z, Math.min(1.2, unitsTall / 2 - FLOOR_PAD - 0.6)),
    }),
    [unitsWide, unitsTall]
  )

  return (
    <>
      {/* **部屋の読み込み待ちは、ここの Suspense で受ける。** 外（Avatar.tsx）の
          Suspense まで届くと、もう出ているひよこごとキャンバスが隠され
          （display:none）、枠が一色になる。隠れた間にキャンバスの大きさが 0 になり、
          環境によってはそのまま WebGL のコンテキストが落ちて戻らない。
          読み込み中は部屋が無いだけで、ひよこは出たままにする */}
      <Suspense fallback={null}>
        <Stage unitsWide={unitsWide} cameraZ={cameraZ} />
      </Suspense>
      {children(roam)}
    </>
  )
}
