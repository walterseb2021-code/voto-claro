export default function NotFound() {
  return (
    <main style={{ padding: 40, textAlign: "center" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Página no encontrada</h1>
      <p style={{ marginTop: 12 }}>
        La página que buscas no existe o fue movida.
      </p>
      <a
        href="/"
        style={{
          display: "inline-block",
          marginTop: 20,
          padding: "10px 16px",
          borderRadius: 8,
          background: "#16a34a",
          color: "white",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Volver al inicio
      </a>
    </main>
  );
}
