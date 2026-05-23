import { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2, Map, Network, Ruler, Sigma } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { HierarchyTree } from './components/HierarchyTree';
import { MaterialDashboard } from './components/MaterialDashboard';
import { ReportFilters } from './components/ReportFilters';
import { SectorReportList } from './components/SectorReportList';
import { AnalysisResult, ReportCategory, SectorReport } from './types/kmz';
import { exportCsv, exportPdf, exportXlsx, formatCategoryValue, formatNumber } from './utils/exportReport';
import { analyzeKmzOrKml } from './utils/parseKml';

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSector, setSelectedSector] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<Set<ReportCategory>>(new Set());
  const [activeTab, setActiveTab] = useState<'report' | 'materials'>('report');

  async function handleFileSelected(file: File) {
    setError(undefined);
    setResult(null);
    setFileName(file.name);
    setIsLoading(true);
    setSelectedSector('all');
    setActiveTab('report');

    try {
      const analysis = await analyzeKmzOrKml(file);
      setResult(analysis);
      setSelectedCategories(new Set(collectCategories(analysis.sectors)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Falha inesperada ao analisar o arquivo.');
    } finally {
      setIsLoading(false);
    }
  }

  function toggleCategory(category: ReportCategory) {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const availableCategories = useMemo(() => (result ? collectCategories(result.sectors) : []), [result]);
  const filteredSectors = useMemo(() => {
    if (!result) return [];
    return result.sectors
      .filter((sector) => selectedSector === 'all' || sector.id === selectedSector)
      .map((sector) => ({
        ...sector,
        categories: sector.categories.filter((category) => selectedCategories.has(category.category)),
      }))
      .filter((sector) => sector.categories.length > 0);
  }, [result, selectedCategories, selectedSector]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-900">
      <div className="flex h-full w-full flex-col">
        <header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-slate-800 bg-slate-950 px-6 text-white">
          <div className="min-w-[280px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300">FTTH KMZ Analyzer</div>
            <h1 className="mt-1 truncate text-xl font-bold tracking-normal">Plataforma tecnica de analise KMZ</h1>
          </div>
          <div className="min-w-0 flex-1">
            <FileUploader fileName={fileName} isLoading={isLoading} onFileSelected={handleFileSelected} compact />
          </div>
          {result ? <HeaderMetrics result={result} /> : null}
        </header>

        {isLoading ? (
          <section className="mx-6 mt-4 flex items-center justify-center gap-3 rounded-md border border-slate-700 bg-slate-900 p-4 text-slate-200 shadow-sm">
            <Loader2 className="animate-spin text-teal-700" size={22} aria-hidden />
            Lendo arvore do KMZ e calculando setores...
          </section>
        ) : null}

        {error ? (
          <section className="mx-6 mt-4 flex gap-3 rounded-md border border-red-900 bg-red-950 p-4 text-red-100">
            <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden />
            <div>
              <h2 className="font-semibold">Nao foi possivel gerar o relatorio</h2>
              <p className="mt-1 text-sm leading-6">{error}</p>
            </div>
          </section>
        ) : null}

        {!result && !isLoading && !error ? <EmptyState /> : null}

        {result ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,380px)_minmax(0,1fr)] bg-slate-100">
            <aside className="min-h-0 resize-x overflow-auto border-r border-slate-800 bg-slate-900">
              <HierarchyTree tree={result.tree} />
            </aside>

            <section className="flex min-w-0 flex-col overflow-hidden">
              <ReportHeader result={result} activeTab={activeTab} onTabChange={setActiveTab} />
              {result.warnings.length > 0 ? <WarningList warnings={result.warnings} /> : null}
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="flex min-h-full flex-col gap-4">
                  <SummaryCards result={result} />
                  {activeTab === 'report' ? (
                    <>
                      <ReportFilters
                        sectors={result.sectors}
                        categories={availableCategories}
                        selectedSector={selectedSector}
                        selectedCategories={selectedCategories}
                        onSectorChange={setSelectedSector}
                        onCategoryToggle={toggleCategory}
                      />
                      <SectorReportList sectors={filteredSectors} />
                      <TotalGeneral result={result} />
                    </>
                  ) : (
                    <MaterialDashboard result={result} />
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function TabNav({
  activeTab,
  onChange,
}: {
  activeTab: 'report' | 'materials';
  onChange: (tab: 'report' | 'materials') => void;
}) {
  return (
    <div className="flex w-fit rounded-md border border-slate-300 bg-slate-100 p-0.5">
      <button
        className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
          activeTab === 'report' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
        }`}
        type="button"
        onClick={() => onChange('report')}
      >
        Relatorio tecnico
      </button>
      <button
        className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
          activeTab === 'materials' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'
        }`}
        type="button"
        onClick={() => onChange('materials')}
      >
        Material
      </button>
    </div>
  );
}

function HeaderMetrics({ result }: { result: AnalysisResult }) {
  const totalMeters = result.totals.categories.reduce((total, category) => total + category.lengthMeters, 0);
  return (
    <div className="flex shrink-0 items-center gap-3 text-xs">
      <HeaderMetric label="Setores" value={result.totals.sectors.toString()} />
      <HeaderMetric label="Placemarks" value={result.totals.placemarks.toString()} />
      <HeaderMetric label="Metragem" value={`${formatNumber(totalMeters)}m`} />
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ReportHeader({
  result,
  activeTab,
  onTabChange,
}: {
  result: AnalysisResult;
  activeTab: 'report' | 'materials';
  onTabChange: (tab: 'report' | 'materials') => void;
}) {
  return (
    <section className="flex h-[58px] shrink-0 items-center justify-between gap-4 border-b border-slate-300 bg-white px-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Projeto ativo</p>
          <h2 className="truncate text-base font-semibold text-slate-950">{result.projectName}</h2>
        </div>
        <TabNav activeTab={activeTab} onChange={onTabChange} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button className="export-button border-slate-300 bg-white text-slate-800 hover:bg-slate-50" type="button" onClick={() => exportCsv(result)}>
          <Download size={18} aria-hidden />
          CSV
        </button>
        <button className="export-button border-slate-300 bg-white text-slate-800 hover:bg-slate-50" type="button" onClick={() => exportPdf(result)}>
          <FileText size={18} aria-hidden />
          PDF
        </button>
        <button className="export-button border-teal-700 bg-teal-700 text-white hover:bg-teal-800" type="button" onClick={() => exportXlsx(result)}>
          <FileSpreadsheet size={18} aria-hidden />
          Excel
        </button>
      </div>
    </section>
  );
}

function SummaryCards({ result }: { result: AnalysisResult }) {
  const totalMeters = result.totals.categories.reduce((total, category) => total + category.lengthMeters, 0);
  const totalArea = result.totals.categories.reduce((total, category) => total + category.areaSquareMeters, 0);
  const cards = [
    { label: 'Setores', value: result.totals.sectors, icon: Map },
    { label: 'Placemarks', value: result.totals.placemarks, icon: Network },
    { label: 'Metragem total', value: `${formatNumber(totalMeters)} m`, icon: Ruler },
    { label: 'Area delimitada', value: `${formatNumber(totalArea)} m2`, icon: Sigma },
  ];

  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.label} className="rounded-md border border-slate-300 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-500">{card.label}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                <Icon size={18} aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-xl font-bold text-slate-950">{card.value}</p>
          </article>
        );
      })}
    </section>
  );
}

function TotalGeneral({ result }: { result: AnalysisResult }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">Total geral</h2>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {result.totals.categories.map((category) => (
          <div key={category.category} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-950">{category.category}</p>
            <p className="mt-1 text-lg font-bold text-teal-800">{formatCategoryValue(category)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <section className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm leading-6 text-amber-900">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </section>
  );
}

function EmptyState() {
  return (
    <section className="m-6 flex min-h-0 flex-1 items-center justify-center rounded-md border border-slate-800 bg-slate-900 p-8 text-slate-300 shadow-sm">
      <div className="max-w-2xl text-center">
        <h2 className="text-xl font-semibold text-white">Aguardando arquivo KMZ/KML</h2>
        <p className="mt-2 text-sm leading-6">
          Carregue um arquivo no header para abrir a arvore tecnica, materiais, reservas e relatorios em layout desktop.
        </p>
      </div>
    </section>
  );
}

function collectCategories(sectors: SectorReport[]): ReportCategory[] {
  const categories = new Set<ReportCategory>();
  sectors.forEach((sector) => sector.categories.forEach((category) => categories.add(category.category)));
  return Array.from(categories);
}
