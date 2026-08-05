export default function AppHeader({ status }: { status: string }) {
  const statusClass = status === 'Online' ? 'chip' : status === 'Offline' ? 'chip error' : 'chip';
  return (
    <header
      style={{
        background: '#111827',
        color: '#ffffff',
        padding: '0.75rem 1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.1rem' }}>CatalogIA</h1>
      <span role="status">
        Status: <span className={statusClass}>{status}</span>
      </span>
    </header>
  );
}
