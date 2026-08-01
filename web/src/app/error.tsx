'use client'

/**
 * Error boundary global (Next.js): si cualquier componente crashea en el
 * navegador, en vez de la pantalla blanca críptica ("Application error: a
 * client-side exception...") se muestra esto, con botón de reintentar y sin
 * tumbar la sesión. Nació del bug del wizard de ventas con casas sin precio.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#faf7f2' }}>
      <div className="max-w-md w-full text-center space-y-4 bg-white rounded-2xl border p-8 shadow-sm" style={{ borderColor: '#e7e0d3' }}>
        <p className="text-4xl">😵</p>
        <h1 className="font-serif text-xl font-semibold" style={{ color: '#1a2744' }}>
          Algo salió mal en esta pantalla
        </h1>
        <p className="text-sm" style={{ color: '#64748b' }}>
          Ocurrió un error inesperado. Tus datos están a salvo — puedes reintentar
          o volver al inicio. Si se repite, avisa al equipo con una captura.
        </p>
        {error?.message && (
          <p className="text-xs font-mono rounded-lg p-2 break-words" style={{ backgroundColor: '#fef2f2', color: '#991b1b' }}>
            {error.message.slice(0, 200)}
          </p>
        )}
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#1a2744' }}
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border"
            style={{ borderColor: '#e7e0d3', color: '#334155' }}
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  )
}
