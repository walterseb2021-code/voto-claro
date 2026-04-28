'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface Dice3DProps {
  rolling: boolean;
  result: number | null;
  onClick: () => void;
  disabled: boolean;
}

function generateFaceTexture(value: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';

  const radius = canvas.width * 0.12;
  const positions: [number, number][] = [];

  const left = canvas.width * 0.3;
  const center = canvas.width * 0.5;
  const right = canvas.width * 0.7;

  const top = canvas.height * 0.3;
  const middle = canvas.height * 0.5;
  const bottom = canvas.height * 0.7;

  if (value === 1) {
    positions.push([center, middle]);
  }

  if (value === 2) {
    positions.push([left, top], [right, bottom]);
  }

  if (value === 3) {
    positions.push([left, top], [center, middle], [right, bottom]);
  }

  if (value === 4) {
    positions.push([left, top], [right, top], [left, bottom], [right, bottom]);
  }

  if (value === 5) {
    positions.push([left, top], [right, top], [center, middle], [left, bottom], [right, bottom]);
  }

  if (value === 6) {
    positions.push([left, top], [right, top], [left, middle], [right, middle], [left, bottom], [right, bottom]);
  }

  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Componente interno del dado 3D
function DiceModel({ rolling, result }: { rolling: boolean; result: number | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [targetRotation, setTargetRotation] = useState<THREE.Euler | null>(null);
  const [animating, setAnimating] = useState(false);

  // Orden de materiales en Box:
  // derecha, izquierda, arriba, abajo, frente, atrás.
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: generateFaceTexture(1), color: 0xffffff }), // derecha
      new THREE.MeshStandardMaterial({ map: generateFaceTexture(2), color: 0xffffff }), // izquierda
      new THREE.MeshStandardMaterial({ map: generateFaceTexture(3), color: 0xffffff }), // arriba
      new THREE.MeshStandardMaterial({ map: generateFaceTexture(4), color: 0xffffff }), // abajo
      new THREE.MeshStandardMaterial({ map: generateFaceTexture(5), color: 0xffffff }), // frente
      new THREE.MeshStandardMaterial({ map: generateFaceTexture(6), color: 0xffffff }), // atrás
    ],
    []
  );

  useEffect(() => {
    return () => {
      for (const material of materials) {
        const map = material.map;
        if (map) map.dispose();
        material.dispose();
      }
    };
  }, [materials]);

  // Rotaciones para dejar el resultado visible en la cara superior.
  const resultRotations = useMemo<Record<number, THREE.Euler>>(
    () => ({
      1: new THREE.Euler(0, 0, Math.PI / 2),
      2: new THREE.Euler(0, 0, -Math.PI / 2),
      3: new THREE.Euler(0, 0, 0),
      4: new THREE.Euler(Math.PI, 0, 0),
      5: new THREE.Euler(-Math.PI / 2, 0, 0),
      6: new THREE.Euler(Math.PI / 2, 0, 0),
    }),
    []
  );

  useEffect(() => {
    let timer: number | undefined;

    if (rolling && !animating) {
      setAnimating(true);

      const randomRot = new THREE.Euler(
        Math.random() * Math.PI * 6,
        Math.random() * Math.PI * 6,
        Math.random() * Math.PI * 6
      );

      setTargetRotation(randomRot);
    }

    if (!rolling && result !== null && animating) {
      const safeResult = Math.min(6, Math.max(1, result));
      setTargetRotation(resultRotations[safeResult]);

      timer = window.setTimeout(() => {
        setAnimating(false);
      }, 350);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [rolling, result, animating, resultRotations]);

  useFrame(() => {
    if (!meshRef.current || !targetRotation) return;

    meshRef.current.rotation.x += (targetRotation.x - meshRef.current.rotation.x) * 0.15;
    meshRef.current.rotation.y += (targetRotation.y - meshRef.current.rotation.y) * 0.15;
    meshRef.current.rotation.z += (targetRotation.z - meshRef.current.rotation.z) * 0.15;

    const closeEnough =
      Math.abs(meshRef.current.rotation.x - targetRotation.x) < 0.01 &&
      Math.abs(meshRef.current.rotation.y - targetRotation.y) < 0.01 &&
      Math.abs(meshRef.current.rotation.z - targetRotation.z) < 0.01;

    if (closeEnough) {
      meshRef.current.rotation.copy(targetRotation);
      setTargetRotation(null);
    }
  });

  return (
    <Box ref={meshRef} args={[1, 1, 1]} material={materials} castShadow receiveShadow />
  );
}

export default function Dice3D({ rolling, result, onClick, disabled }: Dice3DProps) {
  return (
    <div
      className="relative w-20 h-20 cursor-pointer"
      style={{ pointerEvents: disabled ? 'none' : 'auto' }}
      onClick={!disabled ? onClick : undefined}
    >
      <Canvas camera={{ position: [2, 2, 3], fov: 45 }} shadows>
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[-5, 5, 5]} intensity={0.5} castShadow />
        <DiceModel rolling={rolling} result={result} />
        <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
      </Canvas>

      {result !== null && !rolling ? (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border bg-white px-2 py-0.5 text-xs font-extrabold text-slate-900 shadow pointer-events-none">
          {result}
        </div>
      ) : null}
    </div>
  );
}