// src/app/proyecto-ciudadano/registro/page.tsx
'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Función para obtener o crear device_id
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "vc_device_id";
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length > 10) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(KEY, newId);
  return newId;
}

export default function RegistroParticipantePage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string>("");
  const [form, setForm] = useState({
    full_name: '',
    dni: '',
    email: '',
    phone: '',
    address: '',
    district: '',
    alias: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validaciones
    if (!form.full_name || !form.dni || !form.email || !form.phone || !form.alias || !form.address || !form.district) {
      setError('Todos los campos son obligatorios.');
      setLoading(false);
      return;
    }

    if (form.dni.length !== 8) {
      setError('El DNI debe tener 8 dígitos.');
      setLoading(false);
      return;
    }

    if (!form.email.includes('@')) {
      setError('Correo electrónico inválido.');
      setLoading(false);
      return;
    }

    if (!deviceId) {
      setError('No se pudo identificar tu dispositivo. Recarga la página.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('project_participants')
        .insert({
          full_name: form.full_name,
          dni: form.dni,
          email: form.email,
          phone: form.phone,
          address: form.address,
          district: form.district,
          alias: form.alias,
          device_id: deviceId,
        })
        .select()
        .single();

      if (error) throw error;

      setSuccess(true);
    } catch (err: any) {
      if (err.message?.includes('duplicate key') || err.code === '23505') {
        setError('Ya existe un participante con este DNI o correo. Si ya te registraste, intenta iniciar sesión.');
      } else {
        setError(err.message || 'Error al registrar. Intenta nuevamente.');
      }
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-white rounded-2xl border-2 border-green-600 p-8 shadow-sm">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Registro exitoso!</h1>
            <p className="text-slate-600 mb-4">
              Tu perfil ha sido creado correctamente. Serás redirigido a la página principal de Proyecto Ciudadano.
            </p>
            <Link
              href="/proyecto-ciudadano?registered=true"
              className="inline-block bg-green-700 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-800"
            >
              Ir a Proyecto Ciudadano
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Registro de participante</h1>
          <Link href="/proyecto-ciudadano" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl border-2 border-red-600 p-6 shadow-sm">
          <p className="text-slate-600 mb-4 text-sm">
            Completa tus datos para participar en Proyecto Ciudadano. Puedes presentar proyectos y apoyar iniciativas de tu comunidad.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nombres completos *</label>
              <input
                type="text"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">DNI *</label>
              <input
                type="text"
                name="dni"
                value={form.dni}
                onChange={handleChange}
                maxLength={8}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Correo electrónico *</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Celular *</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Alias (público) *</label>
              <input
                type="text"
                name="alias"
                value={form.alias}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
              <p className="text-xs text-slate-500 mt-1">Este alias será visible en los foros y listas de apoyo.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Dirección *</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Distrito *</label>
              <input
                type="text"
                name="district"
                value={form.district}
                onChange={handleChange}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-2 focus:border-green-500 focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50"
            >
              {loading ? 'Registrando...' : 'Registrarme'}
            </button>
          </form>

          <p className="text-xs text-slate-500 mt-4 text-center">
            Al registrarte aceptas nuestras políticas de participación. La veracidad de los datos es responsabilidad del participante. En caso de detectarse información falsa, nos reservamos el derecho de tomar las acciones legales correspondientes.
          </p>
        </div>
      </div>
    </main>
  );
}