import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { useState } from 'react';
import { CategorySummary, SectorReport } from '../types/kmz';
import { formatCategoryValue, formatNumber } from '../utils/exportReport';

type SectorReportListProps = {
  sectors: SectorReport[];
};

export function SectorReportList({ sectors }: SectorReportListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(sectorId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(sectorId)) next.delete(sectorId);
      else next.add(sectorId);
      return next;
    });
  }

  if (sectors.length === 0) {
    return (
      <section className="rounded-md border border-slate-300 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Nenhum setor corresponde aos filtros atuais.
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sectors.map((sector) => {
        const isCollapsed = collapsed.has(sector.id);
        const Icon = isCollapsed ? ChevronRight : ChevronDown;
        return (
          <section key={sector.id} className="rounded-md border border-slate-300 bg-white shadow-sm">
            <button
              className="flex w-full items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left"
              type="button"
              onClick={() => toggle(sector.id)}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Icon size={18} className="shrink-0 text-slate-500" aria-hidden />
                <span>
                  <span className="block text-base font-semibold text-slate-950">[{sector.name}]</span>
                  <span className="block text-xs text-slate-500">{sector.path.join(' / ')}</span>
                </span>
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {sector.placemarkCount} placemarks
              </span>
            </button>

            {!isCollapsed ? <CategoryTable categories={sector.categories} /> : null}
          </section>
        );
      })}
    </div>
  );
}

function CategoryTable({ categories }: { categories: CategorySummary[] }) {
  return (
    <div className="max-h-[42vh] overflow-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 shadow-sm">
          <tr>
            <th className="sticky left-0 z-20 bg-slate-100 px-5 py-3 font-semibold">Categoria</th>
            <th className="px-5 py-3 font-semibold">Resultado</th>
            <th className="px-5 py-3 font-semibold">Qtd.</th>
            <th className="px-5 py-3 font-semibold">Metros</th>
            <th className="px-5 py-3 font-semibold">Km</th>
            <th className="px-5 py-3 font-semibold">m2</th>
            <th className="px-5 py-3 font-semibold">Camadas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {categories.map((category) => (
            <tr key={category.category} className="text-slate-700">
              <td className="sticky left-0 bg-white px-5 py-4 font-semibold text-slate-950">{category.category}</td>
              <td className="px-5 py-4 font-semibold text-teal-800">{formatCategoryValue(category)}</td>
              <td className="px-5 py-4">{category.itemCount}</td>
              <td className="px-5 py-4">{category.lengthMeters ? formatNumber(category.lengthMeters) : '-'}</td>
              <td className="px-5 py-4">{category.lengthKilometers ? formatNumber(category.lengthKilometers) : '-'}</td>
              <td className="px-5 py-4">{category.areaSquareMeters ? formatNumber(category.areaSquareMeters) : '-'}</td>
              <td className="px-5 py-4">
                <span className="inline-flex max-w-[240px] items-center gap-1 truncate text-slate-500">
                  <Layers size={14} aria-hidden />
                  {category.layerNames.join(', ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
