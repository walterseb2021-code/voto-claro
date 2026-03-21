'use client';
import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Html } from '@react-three/drei';
import * as THREE from 'three';

interface Dice3DProps {
  rolling: boolean;
  result: number | null;
  onClick: () => void;
  disabled: boolean;
}

// Componente del dado 3D con animación
function DiceModel({ rolling, result }: { rolling: boolean; result: number | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [rotationTarget, setRotationTarget] = useState<THREE.Euler | null>(null);

  useEffect(() => {
    if (rolling && meshRef.current) {
      // Al lanzar, se generan rotaciones aleatorias en los tres ejes
      const randX = Math.random() * Math.PI * 2;
      const randY = Math.random() * Math.PI * 2;
      const randZ = Math.random() * Math.PI * 2;
      setRotationTarget(new THREE.Euler(randX, randY, randZ));
    } else if (!rolling && result !== null && meshRef.current) {
      // Cuando termina la animación, orientamos el dado para mostrar la cara correcta
      // Aquí se podría mapear el resultado a una rotación específica.
      // Por simplicidad, dejamos que termine con la rotación final y confiamos en que el resultado se muestra en UI.
      // En una versión avanzada, se calcularía la orientación exacta.
      setRotationTarget(null);
    }
  }, [rolling, result]);

  useFrame(() => {
    if (meshRef.current && rotationTarget) {
      // Interpolación suave hacia la rotación objetivo
      meshRef.current.rotation.x += (rotationTarget.x - meshRef.current.rotation.x) * 0.2;
      meshRef.current.rotation.y += (rotationTarget.y - meshRef.current.rotation.y) * 0.2;
      meshRef.current.rotation.z += (rotationTarget.z - meshRef.current.rotation.z) * 0.2;
      // Cuando está cerca, detener la animación
      if (
        Math.abs(meshRef.current.rotation.x - rotationTarget.x) < 0.01 &&
        Math.abs(meshRef.current.rotation.y - rotationTarget.y) < 0.01 &&
        Math.abs(meshRef.current.rotation.z - rotationTarget.z) < 0.01
      ) {
        setRotationTarget(null);
      }
    }
  });

  // Materiales para cada cara (usando texturas de números, aquí se usan colores sólidos con texto)
  // Para simplificar, usaremos un Box con texturas básicas.
  // En producción se pueden usar texturas con números SVG.

  return (
    <Box ref={meshRef} args={[1, 1, 1]} castShadow receiveShadow>
      {/* Cara 1 (frente) */}
      <meshStandardMaterial attach="material-0" color="#f0f0f0" />
      {/* Cara 2 (trasera) */}
      <meshStandardMaterial attach="material-1" color="#f0f0f0" />
      {/* Cara 3 (arriba) */}
      <meshStandardMaterial attach="material-2" color="#f0f0f0" />
      {/* Cara 4 (abajo) */}
      <meshStandardMaterial attach="material-3" color="#f0f0f0" />
      {/* Cara 5 (derecha) */}
      <meshStandardMaterial attach="material-4" color="#f0f0f0" />
      {/* Cara 6 (izquierda) */}
      <meshStandardMaterial attach="material-5" color="#f0f0f0" />
    </Box>
  );
}

export default function Dice3D({ rolling, result, onClick, disabled }: Dice3DProps) {
  return (
    <div
      style={{
        width: 100,
        height: 100,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
      onClick={!disabled ? onClick : undefined}
    >
      <Canvas camera={{ position: [2, 2, 3], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[-5, 5, 5]} intensity={0.5} />
        <DiceModel rolling={rolling} result={result} />
        {/* Mostrar el número en HTML para feedback (opcional) */}
        {result !== null && !rolling && (
          <Html center position={[0, 1.2, 0]}>
            <div className="bg-black/70 text-white text-xl font-bold rounded-full w-8 h-8 flex items-center justify-center">
              {result}
            </div>
          </Html>
        )}
      </Canvas>
    </div>
  );
}