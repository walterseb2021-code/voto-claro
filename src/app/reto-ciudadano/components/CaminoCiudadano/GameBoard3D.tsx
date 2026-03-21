'use client';
import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Plane, Box, Sphere, Text, Line } from '@react-three/drei';
import * as THREE from 'three';

interface GameBoard3DProps {
  position: number; // casilla actual (0..30)
  totalSquares: number;
}

// Componente que construye el camino y los edificios
function BoardScene({ position, totalSquares }: GameBoard3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Posiciones de las casillas en un camino recto o curvo. Por simplicidad, usaremos una línea recta.
  const squarePositions = Array.from({ length: totalSquares }, (_, i) => {
    const x = i * 1.2 - (totalSquares / 2) * 1.2; // centrado
    const z = 0;
    return [x, 0.05, z];
  });

  // Edificios: se colocan al lado del camino en ciertas posiciones (ejemplo)
  const buildings = [
    { name: 'Congreso', position: [-8, 0, 1.5], color: '#8B5A2B' },
    { name: 'Palacio de Justicia', position: [-4, 0, 1.5], color: '#A9A9A9' },
    { name: 'Ministerio de Salud', position: [0, 0, 1.5], color: '#2E8B57' },
    { name: 'Ministerio de Educación', position: [4, 0, 1.5], color: '#4682B4' },
    { name: 'Municipalidad', position: [8, 0, 1.5], color: '#DAA520' },
  ];

  return (
    <group ref={groupRef}>
      {/* Suelo base (paisaje) */}
      <Plane args={[30, 15]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#6B8E23" roughness={0.8} metalness={0.1} />
      </Plane>

      {/* Camino (una línea ancha) */}
      <Box args={[totalSquares * 1.2, 0.1, 1.5]} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial color="#D2B48C" roughness={0.6} />
      </Box>

      {/* Bordes del camino */}
      <Box args={[totalSquares * 1.2, 0.15, 0.1]} position={[0, 0.05, -0.8]} receiveShadow>
        <meshStandardMaterial color="#8B4513" />
      </Box>
      <Box args={[totalSquares * 1.2, 0.15, 0.1]} position={[0, 0.05, 0.8]} receiveShadow>
        <meshStandardMaterial color="#8B4513" />
      </Box>

      {/* Casillas (discos luminosos) */}
      {squarePositions.map((pos, idx) => {
        const isCurrent = position === idx + 1;
        return (
          <group key={idx} position={new THREE.Vector3(pos[0], pos[1], pos[2])}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
              <cylinderGeometry args={[0.4, 0.4, 0.05, 32]} />
              <meshStandardMaterial
                color={isCurrent ? '#FFD966' : '#F0E68C'}
                emissive={isCurrent ? '#FFA500' : '#000000'}
                emissiveIntensity={isCurrent ? 0.8 : 0}
                metalness={0.3}
                roughness={0.4}
              />
            </mesh>
            <Text position={[0, 0.15, 0]} fontSize={0.25} color="black" anchorX="center" anchorY="middle">
              {idx + 1}
            </Text>
          </group>
        );
      })}

      {/* Edificios */}
      {buildings.map((b) => (
        <group key={b.name} position={new THREE.Vector3(b.position[0], b.position[1], b.position[2])}>
          <Box args={[1, 1.2, 1]} position={[0, 0.6, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={b.color} roughness={0.2} metalness={0.1} />
          </Box>
          <Box args={[0.8, 0.4, 0.8]} position={[0, 1.1, 0]} castShadow>
            <meshStandardMaterial color="#CD853F" />
          </Box>
          <Text position={[0, 1.5, 0]} fontSize={0.2} color="white" anchorX="center" anchorY="middle">
            {b.name}
          </Text>
        </group>
      ))}

      {/* Ficha del jugador (esfera luminosa) */}
      {position > 0 && (
        <mesh position={[squarePositions[position - 1][0], 0.25, squarePositions[position - 1][2]]} castShadow>
          <sphereGeometry args={[0.25, 32, 32]} />
          <meshStandardMaterial color="#FF4500" emissive="#FF4500" emissiveIntensity={0.5} metalness={0.8} />
        </mesh>
      )}
    </group>
  );
}

export default function GameBoard3D({ position, totalSquares }: GameBoard3DProps) {
  return (
    <div style={{ width: '100%', height: '400px', background: '#e0f0e0', borderRadius: '12px', overflow: 'hidden' }}>
      <Canvas shadows camera={{ position: [0, 5, 12], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <pointLight position={[0, 5, 0]} intensity={0.3} />
        <BoardScene position={position} totalSquares={totalSquares} />
      </Canvas>
    </div>
  );
}