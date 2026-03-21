'use client';
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface Dice3DProps {
  rolling: boolean;
  result: number | null;
  onClick: () => void;
  disabled: boolean;
}

// Componente interno del dado 3D
function DiceModel({ rolling, result }: { rolling: boolean; result: number | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [targetRotation, setTargetRotation] = useState<THREE.Euler | null>(null);
  const [animating, setAnimating] = useState(false);

  // Generar texturas para las caras (puntos negros sobre fondo blanco)
  const generateFaceTexture = (dots: number[]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    const radius = canvas.width * 0.12;
    const positions: [number, number][] = [];
    if (dots.length === 1) positions.push([canvas.width/2, canvas.height/2]);
    else if (dots.length === 2) positions.push([canvas.width*0.3, canvas.height/2], [canvas.width*0.7, canvas.height/2]);
    else if (dots.length === 3) positions.push([canvas.width*0.3, canvas.height*0.3], [canvas.width/2, canvas.height/2], [canvas.width*0.7, canvas.height*0.7]);
    else if (dots.length === 4) positions.push([canvas.width*0.3, canvas.height*0.3], [canvas.width*0.7, canvas.height*0.3], [canvas.width*0.3, canvas.height*0.7], [canvas.width*0.7, canvas.height*0.7]);
    else if (dots.length === 5) positions.push([canvas.width*0.3, canvas.height*0.3], [canvas.width*0.7, canvas.height*0.3], [canvas.width/2, canvas.height/2], [canvas.width*0.3, canvas.height*0.7], [canvas.width*0.7, canvas.height*0.7]);
    else if (dots.length === 6) positions.push([canvas.width*0.3, canvas.height*0.3], [canvas.width*0.7, canvas.height*0.3], [canvas.width*0.3, canvas.height/2], [canvas.width*0.7, canvas.height/2], [canvas.width*0.3, canvas.height*0.7], [canvas.width*0.7, canvas.height*0.7]);
    for (const [x, y] of positions) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  };

  // Crear materiales con texturas
  const materials = [
    new THREE.MeshStandardMaterial({ map: generateFaceTexture([1]), color: 0xffffff }), // derecha
    new THREE.MeshStandardMaterial({ map: generateFaceTexture([2]), color: 0xffffff }), // izquierda
    new THREE.MeshStandardMaterial({ map: generateFaceTexture([3]), color: 0xffffff }), // arriba
    new THREE.MeshStandardMaterial({ map: generateFaceTexture([4]), color: 0xffffff }), // abajo
    new THREE.MeshStandardMaterial({ map: generateFaceTexture([5]), color: 0xffffff }), // frente
    new THREE.MeshStandardMaterial({ map: generateFaceTexture([6]), color: 0xffffff }), // atrás
  ];

  // Rotaciones para cada resultado (cara superior)
  const resultRotations: Record<number, THREE.Euler> = {
    1: new THREE.Euler(0, 0, 0),                 // 1 arriba
    2: new THREE.Euler(Math.PI / 2, 0, 0),       // 2 arriba (girar 90° en X)
    3: new THREE.Euler(-Math.PI / 2, 0, 0),      // 3 arriba
    4: new THREE.Euler(0, 0, Math.PI / 2),       // 4 arriba
    5: new THREE.Euler(0, 0, -Math.PI / 2),      // 5 arriba
    6: new THREE.Euler(0, Math.PI, 0),           // 6 arriba (girar 180° en Y)
  };

  useEffect(() => {
    if (rolling && !animating) {
      // Iniciar animación de giro aleatorio
      setAnimating(true);
      const randomRot = new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      setTargetRotation(randomRot);
    } else if (!rolling && result !== null && animating) {
      // Finalizar animación: orientar hacia el resultado
      setTargetRotation(resultRotations[result]);
      // Después de un breve tiempo, marcar como no animando
      setTimeout(() => setAnimating(false), 300);
    }
  }, [rolling, result]);

  useFrame(() => {
    if (meshRef.current && targetRotation) {
      // Interpolar suavemente hacia la rotación objetivo
      meshRef.current.rotation.x += (targetRotation.x - meshRef.current.rotation.x) * 0.15;
      meshRef.current.rotation.y += (targetRotation.y - meshRef.current.rotation.y) * 0.15;
      meshRef.current.rotation.z += (targetRotation.z - meshRef.current.rotation.z) * 0.15;
      // Si está muy cerca, dejar de animar
      if (Math.abs(meshRef.current.rotation.x - targetRotation.x) < 0.01 &&
          Math.abs(meshRef.current.rotation.y - targetRotation.y) < 0.01 &&
          Math.abs(meshRef.current.rotation.z - targetRotation.z) < 0.01) {
        setTargetRotation(null);
      }
    }
  });

  return (
    <Box ref={meshRef} args={[1, 1, 1]} material={materials} castShadow receiveShadow />
  );
}

export default function Dice3D({ rolling, result, onClick, disabled }: Dice3DProps) {
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (rolling) {
      setIsRolling(true);
      const timer = setTimeout(() => setIsRolling(false), 500);
      return () => clearTimeout(timer);
    }
  }, [rolling]);

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
      {result !== null && !rolling && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-xl font-bold drop-shadow-md pointer-events-none">
          {/* Opcional: mostrar número grande flotante (para mayor claridad) */}
          {/* {result} */}
        </div>
      )}
    </div>
  );
}