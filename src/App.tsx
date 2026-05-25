import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  MapPinned,
  Network,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import type {
  AnalyzedItem,
  AnalysisResult,
  CableGroup,
  CableSummaryRow,
  CableType,
  CountType,
  ManualMappingValue,
  ManualMappings,
  SummaryRow,
  TreeNode,
} from './types';
import { analyzeFile } from './utils/analyze';
import { exportCsv, exportExcel, exportPdf } from './utils/exporters';

const CABLE_GROUPS: CableGroup[] = ['RAMAIS', 'BACKBONE'];
const CABLE_TYPES: CableType[] = ['CABO 06 F.O', 'CABO 12 F.O', 'CABO 24 F.O', 'CABO 36 F.O', 'CABO 72 F.O', 'CABO 144 F.O'];
const MANUAL_OPTIONS: ManualMappingValue[] = ['SETOR', 'CTO', 'CEO', 'POSTES', 'CABOS', 'RAMAIS', 'BACKBONE', 'CORDOALHAS', 'IGNORAR', 'REDE_MISTA'];

const numberFormatter = new Intl.NumberFormat('pt-BR');
const meterFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const kmFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const preciseMeterFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const preciseKmFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [mappings, setMappings] = useState<ManualMappings>({});
  const [sectorFilter, setSectorFilter] = useState('TODOS');
  const [typeFilter, setTypeFilter] = useState<'TODOS' | CountType>('TODOS');
  const [cableGroupFilter, setCableGroupFilter] = useState<'TODOS' | CableGroup>('TODOS');
  const [cableTypeFilter, setCableTypeFilter] = useState<'TODOS' | CableType>('TODOS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderPath, setSelectedFolderPath] = useState('');

  const sectors = useMemo(() => {
    if (!result) return [];
    return Array.from(new Set(result.rows.map((row) => row.sector))).sort((a, b) => a.localeCompare(b));
  }, [result]);

  const scopedItems = useMemo(() => {
    if (!result) return [];
    return selectedFolderPath ? result.items.filter((item) => item.fullPath.startsWith(`${selectedFolderPath} > `)) : result.items;
  }, [result, selectedFolderPath]);

  const filteredRows = useMemo(() => {
    return summarizeItems(scopedItems).filter((row) => {
      const sectorMatches = sectorFilter === 'TODOS' || row.sector === sectorFilter;
      const typeMatches = typeFilter === 'TODOS' || row.type === typeFilter;
      return sectorMatches && typeMatches;
    });
  }, [scopedItems, sectorFilter, typeFilter]);

  const filteredCableRows = useMemo(() => {
    return summarizeCableItems(scopedItems).filter((row) => {
      const sectorMatches = sectorFilter === 'TODOS' || row.sector === sectorFilter;
      const groupMatches = cableGroupFilter === 'TODOS' || row.group === cableGroupFilter;
      const cableMatches = cableTypeFilter === 'TODOS' || row.cable === cableTypeFilter;
      return sectorMatches && groupMatches && cableMatches;
    });
  }, [scopedItems, sectorFilter, cableGroupFilter, cableTypeFilter]);

  const totals = useMemo(() => buildTotals(filteredRows), [filteredRows]);
  const cableTotals = useMemo(() => buildCableTotals(filteredCableRows), [filteredCableRows]);

  async function runAnalysis(nextFile: File, nextMappings: ManualMappings = mappings) {
    setLoading(true);
    setError('');
    try {
      const nextResult = await analyzeFile(nextFile, nextMappings);
      setResult(nextResult);
      setExpandedFolders(new Set([nextResult.root.fullPath]));
      setSectorFilter('TODOS');
      setTypeFilter('TODOS');
      setCableGroupFilter('TODOS');
      setCableTypeFilter('TODOS');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao analisar o arquivo.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(fileList: FileList | null) {
    const nextFile = fileList?.[0];
    if (!nextFile) return;
    setFile(nextFile);
    setMappings({});
    setSelectedFolderPath('');
    await runAnalysis(nextFile, {});
  }

  function toggleFolder(path: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectFolder(path: string) {
    setSelectedFolderPath(path);
  }

  async function applyMapping(folderPath: string, value: ManualMappingValue) {
    if (!file) return;
    const nextMappings = { ...mappings, [folderPath]: value };
    setMappings(nextMappings);
    await runAnalysis(file, nextMappings);
  }

  return (
    <div className="flex h-screen min-h-screen bg-[#f4f6f8] text-[#18202b]">
      <aside className="flex w-80 shrink-0 flex-col border-r border-[#d8dee6] bg-[#eef2f5]">
        <div className="border-b border-[#d8dee6] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1f405d] text-white">
              <Network size={21} />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">KMZ Analyzer FTTH</h1>
              <p className="text-xs text-[#617080]">Analise local KMZ/KML</p>
            </div>
          </div>
        </div>

        <div className="border-b border-[#d8dee6] p-4">
          <input ref={fileInputRef} className="hidden" type="file" accept=".kmz,.kml" onChange={(event) => handleFile(event.target.files)} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#1f405d] px-3 text-sm font-semibold text-white hover:bg-[#17324a]"
          >
            <Upload size={18} />
            Importar KMZ/KML
          </button>
          {file && <p className="mt-3 truncate text-xs text-[#617080]">{file.name}</p>}
          {error && (
            <div className="mt-3 flex gap-2 rounded-md border border-[#e1a3a3] bg-[#fff0f0] p-3 text-xs text-[#8f2d2d]">
              <X size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[#d8dee6] px-4 py-3 text-sm font-semibold">
            <FolderTree size={17} />
            Arvore do KMZ
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {result ? (
              <TreeView node={result.root} expandedFolders={expandedFolders} selectedPath={selectedFolderPath} onToggle={toggleFolder} onSelect={selectFolder} />
            ) : (
              <div className="rounded-md border border-dashed border-[#b9c3ce] p-4 text-sm text-[#617080]">Nenhum arquivo carregado.</div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#d8dee6] bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">Painel tecnico</h2>
            <p className="text-sm text-[#617080]">{result ? `${result.items.length} itens validos em ${sectors.length} setor(es)` : 'Aguardando arquivo'}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton icon={<FileText size={16} />} label="CSV" disabled={!filteredRows.length} onClick={() => exportCsv(filteredRows)} />
            <ExportButton icon={<FileSpreadsheet size={16} />} label="Excel" disabled={!filteredRows.length} onClick={() => exportExcel(filteredRows)} />
            <ExportButton icon={<Download size={16} />} label="PDF" disabled={!filteredRows.length} onClick={() => exportPdf(filteredRows)} />
          </div>
        </div>

        <div className="border-b border-[#d8dee6] bg-[#fbfcfd] px-6 py-3">
          <div className="flex items-center gap-3">
            <FilterSelect label="Setor" value={sectorFilter} onChange={setSectorFilter} options={['TODOS', ...sectors]} />
            <FilterSelect
              label="Tipo"
              value={typeFilter}
              onChange={(value) => setTypeFilter(value as 'TODOS' | CountType)}
              options={['TODOS', 'POSTES', 'CTO', 'CEO', 'RAMAIS', 'BACKBONE', 'CORDOALHAS']}
            />
            <FilterSelect label="Grupo" value={cableGroupFilter} onChange={(value) => setCableGroupFilter(value as 'TODOS' | CableGroup)} options={['TODOS', ...CABLE_GROUPS]} />
            <FilterSelect
              label="Tipo de cabo"
              value={cableTypeFilter}
              onChange={(value) => setCableTypeFilter(value as 'TODOS' | CableType)}
              options={['TODOS', ...CABLE_TYPES]}
            />
            {selectedFolderPath && (
              <button
                type="button"
                onClick={() => setSelectedFolderPath('')}
                className="flex h-9 max-w-[360px] items-center gap-2 rounded-md border border-[#cbd3dc] bg-white px-3 text-sm hover:bg-[#eef2f5]"
                title={selectedFolderPath}
              >
                <X size={15} />
                <span className="truncate">Pasta: {selectedFolderPath}</span>
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          <section className="grid grid-cols-8 gap-3">
            <MetricCard label="Setores" value={sectors.length} />
            <MetricCard label="CTOs" value={totals.CTO.quantity} />
            <MetricCard label="CEOs" value={totals.CEO.quantity} />
            <MetricCard label="Postes" value={totals.POSTES.quantity} />
            <MetricCard label="Total de ramais" value={cableTotals.RAMAIS.quantity} />
            <MetricCard label="KM de ramais" value={`${preciseKmFormatter.format(cableTotals.RAMAIS.km)}km`} />
            <MetricCard label="Total de backbone" value={cableTotals.BACKBONE.quantity} />
            <MetricCard label="KM de backbone" value={`${preciseKmFormatter.format(cableTotals.BACKBONE.km)}km`} />
          </section>

          <section className="mt-3 grid grid-cols-4 gap-3">
            <MetricCard label="Ramais" value={totals.RAMAIS.quantity} />
            <MetricCard label="Backbone" value={totals.BACKBONE.quantity} />
            <MetricCard label="Cordoalhas" value={totals.CORDOALHAS.quantity} />
            <MetricCard label="Metragem total" value={`${meterFormatter.format(totals.meters)}m`} />
          </section>

          {loading && <div className="mt-5 rounded-md border border-[#d8dee6] bg-white p-4 text-sm">Processando arquivo...</div>}

          {result && result.unknownFolders.length > 0 && (
            <section className="mt-5 border border-[#d8dee6] bg-white">
              <div className="flex items-center gap-2 border-b border-[#d8dee6] px-4 py-3 font-semibold">
                <MapPinned size={17} />
                Mapeamento manual
              </div>
              <div className="max-h-52 overflow-auto">
                {result.unknownFolders.map((folder) => (
                  <div key={folder.id} className="grid grid-cols-[1fr_190px] items-center gap-3 border-b border-[#edf0f3] px-4 py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{folder.name}</p>
                      <p className="truncate text-xs text-[#617080]">{folder.fullPath}</p>
                    </div>
                    <select className="h-9 rounded-md border border-[#cbd3dc] bg-white px-2 text-sm" value={mappings[folder.fullPath] ?? ''} onChange={(event) => applyMapping(folder.fullPath, event.target.value as ManualMappingValue)}>
                      <option value="" disabled>
                        Como tratar?
                      </option>
                      {MANUAL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          <CableSummaryTable rows={filteredCableRows} />
          <SectorSummaryTable rows={filteredRows} validationCount={result?.validation.length ?? 0} />
        </div>
      </main>
    </div>
  );
}

function TreeView({
  node,
  depth = 0,
  expandedFolders,
  selectedPath,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth?: number;
  expandedFolders: Set<string>;
  selectedPath: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedFolders.has(node.fullPath);
  const selected = selectedPath === node.fullPath;

  return (
    <div>
      <div className={`flex h-7 items-center gap-1 rounded-md pr-2 text-sm ${selected ? 'bg-[#dce8f2] text-[#17324a]' : 'hover:bg-[#e4eaf0]'}`} style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          disabled={!hasChildren}
          onClick={() => onToggle(node.fullPath)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-white/70 disabled:opacity-30"
          aria-label={expanded ? 'Recolher pasta' : 'Expandir pasta'}
        >
          {hasChildren ? expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : <ChevronRight size={15} />}
        </button>
        {expanded ? <FolderOpen size={15} className="shrink-0 text-[#617080]" /> : <Folder size={15} className="shrink-0 text-[#617080]" />}
        <button type="button" onClick={() => onSelect(node.fullPath)} className="min-w-0 flex-1 truncate text-left" title={node.fullPath}>
          {node.name}
        </button>
        <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[11px] text-[#617080]">{numberFormatter.format(node.placemarkCount)}</span>
      </div>
      {expanded &&
        node.children.map((child) => (
          <TreeView key={child.id} node={child} depth={depth + 1} expandedFolders={expandedFolders} selectedPath={selectedPath} onToggle={onToggle} onSelect={onSelect} />
        ))}
    </div>
  );
}

function CableSummaryTable({ rows }: { rows: CableSummaryRow[] }) {
  return (
    <section className="mt-5 border border-[#d8dee6] bg-white">
      <div className="flex items-center justify-between border-b border-[#d8dee6] px-4 py-3">
        <h3 className="font-semibold">Resumo de cabos</h3>
        <span className="text-xs text-[#617080]">SETOR | GRUPO | CABO | QUANTIDADE | METROS | KM</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="bg-[#eef2f5] text-left text-xs uppercase text-[#526171]">
            <tr>
              <th className="px-4 py-3">Setor</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Cabo</th>
              <th className="px-4 py-3 text-right">Quantidade</th>
              <th className="px-4 py-3 text-right">Metros</th>
              <th className="px-4 py-3 text-right">KM</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${row.sector}-${row.group}-${row.cable}`} className="border-t border-[#edf0f3]">
                  <td className="px-4 py-3 font-medium">{row.sector}</td>
                  <td className="px-4 py-3">{row.group}</td>
                  <td className="px-4 py-3">{row.cable}</td>
                  <td className="px-4 py-3 text-right">{numberFormatter.format(row.quantity)}</td>
                  <td className="px-4 py-3 text-right">{preciseMeterFormatter.format(row.meters)}m</td>
                  <td className="px-4 py-3 text-right">{preciseKmFormatter.format(row.km)}km</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-[#617080]" colSpan={6}>
                  Nenhum cabo identificado pelos padroes configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectorSummaryTable({ rows, validationCount }: { rows: SummaryRow[]; validationCount: number }) {
  return (
    <section className="mt-5 border border-[#d8dee6] bg-white">
      <div className="flex items-center justify-between border-b border-[#d8dee6] px-4 py-3">
        <h3 className="font-semibold">Resumo por setor</h3>
        <div className="flex items-center gap-2 text-xs text-[#617080]">
          <ShieldCheck size={15} />
          {validationCount} item(ns) ignorado(s) por geometria incompatível
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-[#eef2f5] text-left text-xs uppercase text-[#526171]">
            <tr>
              <th className="px-4 py-3">Setor</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Quantidade</th>
              <th className="px-4 py-3 text-right">Metros</th>
              <th className="px-4 py-3 text-right">KM</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${row.sector}-${row.type}`} className="border-t border-[#edf0f3]">
                  <td className="px-4 py-3 font-medium">{row.sector}</td>
                  <td className="px-4 py-3">{row.type}</td>
                  <td className="px-4 py-3 text-right">{numberFormatter.format(row.quantity)}</td>
                  <td className="px-4 py-3 text-right">{row.meters > 0 ? `${meterFormatter.format(row.meters)}m` : '-'}</td>
                  <td className="px-4 py-3 text-right">{row.km > 0 ? `${kmFormatter.format(row.km)}km` : '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-[#617080]" colSpan={5}>
                  Nenhum dado para exibir.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-h-24 border border-[#d8dee6] bg-white p-3">
      <p className="text-xs font-semibold uppercase text-[#617080]">{label}</p>
      <p className="mt-3 truncate text-2xl font-semibold">{typeof value === 'number' ? numberFormatter.format(value) : value}</p>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <select className="h-9 min-w-44 rounded-md border border-[#cbd3dc] bg-white px-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExportButton({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-md border border-[#cbd3dc] bg-white px-3 text-sm font-medium hover:bg-[#eef2f5] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {icon}
      {label}
    </button>
  );
}

function buildTotals(rows: SummaryRow[]) {
  const totals = {
    CTO: { quantity: 0, meters: 0 },
    CEO: { quantity: 0, meters: 0 },
    POSTES: { quantity: 0, meters: 0 },
    RAMAIS: { quantity: 0, meters: 0 },
    BACKBONE: { quantity: 0, meters: 0 },
    CORDOALHAS: { quantity: 0, meters: 0 },
    meters: 0,
  };

  for (const row of rows) {
    totals[row.type].quantity += row.quantity;
    totals[row.type].meters += row.meters;
    totals.meters += row.meters;
  }
  return totals;
}

function summarizeItems(items: AnalyzedItem[]): SummaryRow[] {
  const order: CountType[] = ['POSTES', 'CTO', 'CEO', 'RAMAIS', 'BACKBONE', 'CORDOALHAS'];
  const grouped = new Map<string, SummaryRow>();

  for (const item of items) {
    const key = `${item.sector}:${item.type}`;
    const row = grouped.get(key) ?? { sector: item.sector, type: item.type, quantity: 0, meters: 0, km: 0 };
    row.quantity += 1;
    row.meters += item.meters;
    row.km = row.meters / 1000;
    grouped.set(key, row);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const sectorSort = a.sector.localeCompare(b.sector);
    if (sectorSort !== 0) return sectorSort;
    return order.indexOf(a.type) - order.indexOf(b.type);
  });
}

function summarizeCableItems(items: AnalyzedItem[]): CableSummaryRow[] {
  const grouped = new Map<string, CableSummaryRow>();

  for (const item of items) {
    if (!item.cableGroup || !item.cableType) continue;
    const key = `${item.sector}:${item.cableGroup}:${item.cableType}`;
    const row = grouped.get(key) ?? {
      sector: item.sector,
      group: item.cableGroup,
      cable: item.cableType,
      quantity: 0,
      meters: 0,
      km: 0,
    };
    row.quantity += 1;
    row.meters += item.meters;
    row.km = row.meters / 1000;
    grouped.set(key, row);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const sectorSort = a.sector.localeCompare(b.sector);
    if (sectorSort !== 0) return sectorSort;
    const groupSort = a.group.localeCompare(b.group);
    if (groupSort !== 0) return groupSort;
    return CABLE_TYPES.indexOf(a.cable) - CABLE_TYPES.indexOf(b.cable);
  });
}

function buildCableTotals(rows: CableSummaryRow[]) {
  const totals = {
    RAMAIS: { quantity: 0, meters: 0, km: 0 },
    BACKBONE: { quantity: 0, meters: 0, km: 0 },
  };

  for (const row of rows) {
    totals[row.group].quantity += row.quantity;
    totals[row.group].meters += row.meters;
    totals[row.group].km = totals[row.group].meters / 1000;
  }

  return totals;
}
