// src/app/espacio-emprendedor/components/CapturaFotos.tsx
'use client';
import { useState, useRef } from 'react';

type CapturaFotosProps = {
  onFotosCapturadas: (dniUrl: string, rostroUrl: string) => void;
  disabled?: boolean;
};

export default function CapturaFotos({ onFotosCapturadas, disabled }: CapturaFotosProps) {
  const [dniFoto, setDniFoto] = useState<string | null>(null);
  const [rostroFoto, setRostroFoto] = useState<string | null>(null);
  const [modo, setModo] = useState<'dni' | 'rostro' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const iniciarCamara = async (tipo: 'dni' | 'rostro') => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setModo(tipo);
    } catch (err) {
      console.error('Error al acceder a la cámara:', err);
      alert('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  };

  const capturarFoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const fotoUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    if (modo === 'dni') {
      setDniFoto(fotoUrl);
    } else if (modo === 'rostro') {
      setRostroFoto(fotoUrl);
    }
    
    // Detener cámara
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setModo(null);
    
    // Si ambas fotos están listas, llamar al callback
    if (modo === 'dni' && rostroFoto) {
      onFotosCapturadas(fotoUrl, rostroFoto);
    } else if (modo === 'rostro' && dniFoto) {
      onFotosCapturadas(dniFoto, fotoUrl);
    }
  };

  const reiniciar = () => {
    setDniFoto(null);
    setRostroFoto(null);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setModo(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Foto del DNI */}
        <div className="border-2 border-slate-200 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold mb-2">📄 Foto del DNI (anverso)</p>
          {dniFoto ? (
            <div>
              <img src={dniFoto} alt="DNI" className="w-full rounded-lg mb-2" />
              <button
                type="button"
                onClick={() => setDniFoto(null)}
                className="text-xs text-red-600 hover:underline"
                disabled={disabled}
              >
                Volver a tomar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => iniciarCamara('dni')}
              disabled={disabled}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              📸 Tomar foto DNI
            </button>
          )}
        </div>

        {/* Foto del rostro */}
        <div className="border-2 border-slate-200 rounded-xl p-4 text-center">
          <p className="text-sm font-semibold mb-2">😊 Foto de tu rostro</p>
          {rostroFoto ? (
            <div>
              <img src={rostroFoto} alt="Rostro" className="w-full rounded-lg mb-2" />
              <button
                type="button"
                onClick={() => setRostroFoto(null)}
                className="text-xs text-red-600 hover:underline"
                disabled={disabled}
              >
                Volver a tomar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => iniciarCamara('rostro')}
              disabled={disabled}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              📸 Tomar selfie
            </button>
          )}
        </div>
      </div>

      {/* Previsualización de cámara */}
      {modo && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-md rounded-lg" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-4 mt-4">
            <button
              onClick={capturarFoto}
              className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold"
            >
              📸 Capturar
            </button>
            <button
              onClick={() => {
                if (stream) stream.getTracks().forEach(track => track.stop());
                setModo(null);
              }}
              className="bg-red-600 text-white px-6 py-3 rounded-xl font-semibold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {(dniFoto && rostroFoto) && (
        <div className="text-xs text-green-600 bg-green-50 p-2 rounded-lg text-center">
          ✅ Ambas fotos capturadas. Continúa con el registro.
        </div>
      )}
    </div>
  );
}