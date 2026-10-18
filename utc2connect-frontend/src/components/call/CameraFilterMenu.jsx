const FILTERS = [
  { id: 'none', label: 'Gốc' },
  { id: 'beauty', label: 'Làm mịn da' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'bw', label: 'Đen trắng' },
];

// Nút ✨ + menu lọc màu camera kiểu Azar
export default function CameraFilterMenu({ filters }) {
  const { cameraFilter, showFilters, setShowFilters, handleFilterChange } = filters;

  return (
    <div className="azar-filter-wrapper">
      <button className="azar-magic-btn" onClick={() => setShowFilters(!showFilters)} title="Chỉnh màu Camera">
        ✨
      </button>
      {showFilters && (
        <div className="azar-filter-menu">
          {FILTERS.map((f) => (
            <button key={f.id} className={cameraFilter === f.id ? 'active' : ''} onClick={() => handleFilterChange(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
