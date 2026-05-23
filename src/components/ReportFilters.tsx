import { Filter } from 'lucide-react';
import { ReportCategory, SectorReport } from '../types/kmz';

type ReportFiltersProps = {
  sectors: SectorReport[];
  categories: ReportCategory[];
  selectedSector: string;
  selectedCategories: Set<ReportCategory>;
  onSectorChange: (sectorId: string) => void;
  onCategoryToggle: (category: ReportCategory) => void;
};

export function ReportFilters({
  sectors,
  categories,
  selectedSector,
  selectedCategories,
  onSectorChange,
  onCategoryToggle,
}: ReportFiltersProps) {
  return (
    <section className="rounded-md border border-slate-300 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <Filter size={17} aria-hidden />
        Filtros
      </div>
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
          Setor
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            value={selectedSector}
            onChange={(event) => onSectorChange(event.target.value)}
          >
            <option value="all">Todos os setores</option>
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <label
              key={category}
              className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700"
            >
              <input
                className="h-4 w-4 accent-teal-700"
                type="checkbox"
                checked={selectedCategories.has(category)}
                onChange={() => onCategoryToggle(category)}
              />
              {category}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
