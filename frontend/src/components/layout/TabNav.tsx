export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export default function TabNav({
  tabs,
  active,
  onChange
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        gap: '0.25rem',
        padding: '0 0.75rem'
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          style={{
            background: active === tab.id ? '#eff6ff' : 'transparent',
            border: 'none',
            borderBottom: active === tab.id ? '2px solid #2563eb' : '2px solid transparent',
            padding: '0.6rem 0.9rem',
            cursor: tab.disabled ? 'not-allowed' : 'pointer',
            fontWeight: active === tab.id ? 600 : 400,
            color: tab.disabled ? '#9ca3af' : '#374151',
            opacity: tab.disabled ? 0.7 : 1
          }}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
