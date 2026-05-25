import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
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
  Users,
  X,
} from 'lucide-react';
import type {
  AnalyzedItem,
  AnalysisResult,
  CableGroup,
  CableSummaryRow,
  CableType,
  Coordinate,
  CountType,
  ManualMappingValue,
  ManualMappings,
  SummaryRow,
  TreeNode,
} from './types';
import { analyzeFile } from './utils/analyze';
import { exportCsv, exportExcel, exportPdf } from './utils/exporters';

const CABLE_GROUPS: CableGroup[] = ['RAMAL', 'BACKBONE'];
const CABLE_TYPES: CableType[] = ['CABO 06 F.O', 'CABO 12 F.O', 'CABO 24 F.O', 'CABO 36 F.O', 'CABO 72 F.O', 'CABO 144 F.O'];
const MANUAL_OPTIONS: ManualMappingValue[] = ['SETOR', 'CTO', 'CEO', 'POSTES', 'CABOS', 'RAMAIS', 'BACKBONE', 'CORDOALHAS', 'IGNORAR', 'REDE_MISTA'];

const numberFormatter = new Intl.NumberFormat('pt-BR');
const meterFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const kmFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const preciseMeterFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const preciseKmFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const DEFAULT_INSTALLATION_SETTINGS = {
  technicians: 7,
  ceoConservative: 3,
  ceoOptimistic: 4,
  ctoConservative: 5,
  ctoOptimistic: 10,
};
const RESERVA_POR_PONTO_METROS = 15;
const TOLERANCIA_CONEXAO_METROS = 3;
const TECHNICAL_RESERVE_INITIAL_ROWS = 10;

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
  const [installationStartDate, setInstallationStartDate] = useState('');
  const [installationTechnicians, setInstallationTechnicians] = useState(DEFAULT_INSTALLATION_SETTINGS.technicians);
  const [installationCeoConservative, setInstallationCeoConservative] = useState(DEFAULT_INSTALLATION_SETTINGS.ceoConservative);
  const [installationCeoOptimistic, setInstallationCeoOptimistic] = useState(DEFAULT_INSTALLATION_SETTINGS.ceoOptimistic);
  const [installationCtoConservative, setInstallationCtoConservative] = useState(DEFAULT_INSTALLATION_SETTINGS.ctoConservative);
  const [installationCtoOptimistic, setInstallationCtoOptimistic] = useState(DEFAULT_INSTALLATION_SETTINGS.ctoOptimistic);
  const [installationBusinessDaysOnly, setInstallationBusinessDaysOnly] = useState(false);

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
  const technicalReserveRows = useMemo(() => {
    return calculateTechnicalReserve(scopedItems).filter((row) => {
      const sectorMatches = sectorFilter === 'TODOS' || row.sector === sectorFilter;
      const groupMatches = cableGroupFilter === 'TODOS' || row.group === cableGroupFilter;
      const cableMatches = cableTypeFilter === 'TODOS' || row.cable === cableTypeFilter;
      return sectorMatches && groupMatches && cableMatches;
    });
  }, [scopedItems, sectorFilter, cableGroupFilter, cableTypeFilter]);
  const technicalReserveSummary = useMemo(() => buildTechnicalReserveSummary(technicalReserveRows), [technicalReserveRows]);
  const installationRows = useMemo(() => {
    return summarizeItems(scopedItems).filter((row) => sectorFilter === 'TODOS' || row.sector === sectorFilter);
  }, [scopedItems, sectorFilter]);
  const installationEstimate = useMemo(() => {
    const installationTotals = buildTotals(installationRows);
    return calculateInstallation({
      totalCEO: installationTotals.CEO.quantity,
      totalCTO: installationTotals.CTO.quantity,
      startDate: installationStartDate,
      businessDaysOnly: installationBusinessDaysOnly,
      settings: {
        technicians: installationTechnicians,
        ceoConservative: installationCeoConservative,
        ceoOptimistic: installationCeoOptimistic,
        ctoConservative: installationCtoConservative,
        ctoOptimistic: installationCtoOptimistic,
      },
    });
  }, [
    installationRows,
    installationStartDate,
    installationBusinessDaysOnly,
    installationTechnicians,
    installationCeoConservative,
    installationCeoOptimistic,
    installationCtoConservative,
    installationCtoOptimistic,
  ]);

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
            <MetricCard label="Total de ramais" value={cableTotals.RAMAL.quantity} />
            <MetricCard label="KM de ramais" value={`${preciseKmFormatter.format(cableTotals.RAMAL.km)}km`} />
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

          <InstallationSection
            estimate={installationEstimate}
            startDate={installationStartDate}
            onStartDateChange={setInstallationStartDate}
            businessDaysOnly={installationBusinessDaysOnly}
            onBusinessDaysOnlyChange={setInstallationBusinessDaysOnly}
            settings={{
              technicians: installationTechnicians,
              ceoConservative: installationCeoConservative,
              ceoOptimistic: installationCeoOptimistic,
              ctoConservative: installationCtoConservative,
              ctoOptimistic: installationCtoOptimistic,
            }}
            onSettingsChange={{
              technicians: setInstallationTechnicians,
              ceoConservative: setInstallationCeoConservative,
              ceoOptimistic: setInstallationCeoOptimistic,
              ctoConservative: setInstallationCtoConservative,
              ctoOptimistic: setInstallationCtoOptimistic,
            }}
          />
          <TechnicalReserveSection rows={technicalReserveRows} summary={technicalReserveSummary} />
          <CableSummaryTable rows={filteredCableRows} />
          <SectorSummaryTable rows={filteredRows} validationCount={result?.validation.length ?? 0} />
        </div>
      </main>
    </div>
  );
}

function InstallationSection({
  estimate,
  startDate,
  onStartDateChange,
  businessDaysOnly,
  onBusinessDaysOnlyChange,
  settings,
  onSettingsChange,
}: {
  estimate: InstallationEstimate;
  startDate: string;
  onStartDateChange: (value: string) => void;
  businessDaysOnly: boolean;
  onBusinessDaysOnlyChange: (value: boolean) => void;
  settings: InstallationSettings;
  onSettingsChange: Record<keyof InstallationSettings, (value: number) => void>;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-[#d8dee6] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8dee6] bg-[#fbfcfd] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={17} />
          <div>
            <h3 className="font-semibold">Instalação</h3>
            <p className="text-xs text-[#617080]">Prazo estimado por produtividade da equipe</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Data de inicio</span>
          <input
            type="date"
            className="h-9 rounded-md border border-[#cbd3dc] bg-white px-2"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3 p-4">
        <InstallationInputCard
          label="Técnicos disponíveis"
          icon={<Users size={18} />}
          value={settings.technicians}
          defaultValue={DEFAULT_INSTALLATION_SETTINGS.technicians}
          onChange={onSettingsChange.technicians}
        />
        <InstallationRangeInputCard
          label="CEO por técnico/dia"
          conservativeValue={settings.ceoConservative}
          optimisticValue={settings.ceoOptimistic}
          conservativeDefault={DEFAULT_INSTALLATION_SETTINGS.ceoConservative}
          optimisticDefault={DEFAULT_INSTALLATION_SETTINGS.ceoOptimistic}
          onConservativeChange={onSettingsChange.ceoConservative}
          onOptimisticChange={onSettingsChange.ceoOptimistic}
        />
        <InstallationRangeInputCard
          label="CTO por técnico/dia"
          conservativeValue={settings.ctoConservative}
          optimisticValue={settings.ctoOptimistic}
          conservativeDefault={DEFAULT_INSTALLATION_SETTINGS.ctoConservative}
          optimisticDefault={DEFAULT_INSTALLATION_SETTINGS.ctoOptimistic}
          onConservativeChange={onSettingsChange.ctoConservative}
          onOptimisticChange={onSettingsChange.ctoOptimistic}
        />
      </div>

      <div className="border-t border-[#edf0f3] bg-[#fbfcfd] px-4 py-3">
        <label className="inline-flex items-center gap-2 text-sm text-[#617080]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#cbd3dc]"
            checked={businessDaysOnly}
            onChange={(event) => onBusinessDaysOnlyChange(event.target.checked)}
          />
          Considerar apenas dias úteis
        </label>
      </div>

      <div className="overflow-auto border-t border-[#edf0f3]">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-[#eef2f5] text-left text-xs uppercase text-[#526171]">
            <tr>
              <th className="px-4 py-3">Etapa</th>
              <th className="px-4 py-3 text-right">Quantidade</th>
              <th className="px-4 py-3 text-right">Produtividade/dia</th>
              <th className="px-4 py-3 text-right">Dias conservador</th>
              <th className="px-4 py-3 text-right">Dias otimista</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[#edf0f3] hover:bg-[#fbfcfd]">
              <td className="px-4 py-3 font-medium">CEO</td>
              <td className="px-4 py-3 text-right">{numberFormatter.format(estimate.ceo.quantity)}</td>
              <td className="px-4 py-3 text-right">{estimate.capacity.ceoConservative} a {estimate.capacity.ceoOptimistic} por dia</td>
              <td className="px-4 py-3 text-right">{formatDays(estimate.ceo.conservative)}</td>
              <td className="px-4 py-3 text-right">{formatDays(estimate.ceo.optimistic)}</td>
            </tr>
            <tr className="border-t border-[#edf0f3] hover:bg-[#fbfcfd]">
              <td className="px-4 py-3 font-medium">CTO</td>
              <td className="px-4 py-3 text-right">{numberFormatter.format(estimate.cto.quantity)}</td>
              <td className="px-4 py-3 text-right">{estimate.capacity.ctoConservative} a {estimate.capacity.ctoOptimistic} por dia</td>
              <td className="px-4 py-3 text-right">{formatDays(estimate.cto.conservative)}</td>
              <td className="px-4 py-3 text-right">{formatDays(estimate.cto.optimistic)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-[#edf0f3] bg-[#fbfcfd] p-4">
        <InstallationScenario title="Cenário conservador" ceoDays={estimate.ceo.conservative} ctoDays={estimate.cto.conservative} totalDays={estimate.total.conservative} endDate={estimate.endDate.conservative} />
        <InstallationScenario title="Cenário otimista" ceoDays={estimate.ceo.optimistic} ctoDays={estimate.cto.optimistic} totalDays={estimate.total.optimistic} endDate={estimate.endDate.optimistic} />
      </div>
    </section>
  );
}

function TechnicalReserveSection({ rows, summary }: { rows: TechnicalReserveRow[]; summary: TechnicalReserveSummaryRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, TECHNICAL_RESERVE_INITIAL_ROWS);
  const hiddenRows = Math.max(0, rows.length - visibleRows.length);

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-[#d8dee6] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#d8dee6] bg-[#fbfcfd] px-4 py-3">
        <div>
          <h3 className="font-semibold">Reserva Técnica</h3>
          <p className="text-xs text-[#617080]">Camada calculada: metragem linear + reserva operacional</p>
        </div>
        <span className="rounded-md border border-[#cbd3dc] bg-white px-2 py-1 text-xs font-medium text-[#526171]">
          {RESERVA_POR_PONTO_METROS}m por ponto | tolerância {TOLERANCIA_CONEXAO_METROS}m
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-[#eef2f5] text-left text-xs uppercase text-[#526171]">
            <tr>
              <th className="px-4 py-3">Referência</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Cabo</th>
              <th className="px-4 py-3">Tipo de ponto</th>
              <th className="px-4 py-3 text-right">Qtd pontos</th>
              <th className="px-4 py-3 text-right">Metragem linear</th>
              <th className="px-4 py-3 text-right">Reserva</th>
              <th className="px-4 py-3 text-right">Metragem final</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf0f3] hover:bg-[#fbfcfd]">
                  <td className="px-4 py-3 font-medium" title={row.parentFolderPath}>{row.reference}</td>
                  <td className="px-4 py-3"><Pill>{row.group}</Pill></td>
                  <td className="px-4 py-3 font-medium">{row.cable}</td>
                  <td className="px-4 py-3"><Pill tone="muted">{row.pointType}</Pill></td>
                  <td className="px-4 py-3 text-right">{formatPointCount(row.quantityPoints, row.pointType)}</td>
                  <td className="px-4 py-3 text-right">{formatMetersAndKm(row.linearMeters)}</td>
                  <td className="px-4 py-3 text-right">{preciseMeterFormatter.format(row.reserveMeters)}m</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMetersAndKm(row.finalMeters)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-[#617080]" colSpan={8}>
                  Nenhum cabo com reserva técnica para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > TECHNICAL_RESERVE_INITIAL_ROWS && (
        <div className="flex items-center justify-between border-t border-[#edf0f3] bg-[#fbfcfd] px-4 py-3">
          <span className="text-sm text-[#617080]">
            Exibindo {numberFormatter.format(visibleRows.length)} de {numberFormatter.format(rows.length)} cabo(s)
          </span>
          <button
            type="button"
            className="rounded-md border border-[#cbd3dc] bg-white px-3 py-2 text-sm font-medium hover:bg-[#eef2f5]"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Mostrar menos' : `Mostrar mais ${numberFormatter.format(hiddenRows)}`}
          </button>
        </div>
      )}

      <div className="border-t border-[#edf0f3] bg-[#fbfcfd] px-4 py-3">
        <h4 className="font-semibold">Resumo por tipo de cabo</h4>
        <div className="mt-3 overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-[#eef2f5] text-left text-xs uppercase text-[#526171]">
              <tr>
                <th className="px-4 py-3">Cabo</th>
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3 text-right">Qtd pontos</th>
                <th className="px-4 py-3 text-right">Reserva total</th>
                <th className="px-4 py-3 text-right">Metragem linear</th>
                <th className="px-4 py-3 text-right">Metragem final</th>
              </tr>
            </thead>
            <tbody>
              {summary.length ? (
                summary.map((row) => (
                  <tr key={`${row.group}-${row.cable}`} className="border-t border-[#edf0f3] hover:bg-white">
                    <td className="px-4 py-3 font-medium">{row.cable}</td>
                    <td className="px-4 py-3"><Pill>{row.group}</Pill></td>
                    <td className="px-4 py-3 text-right">{formatPointCount(row.quantityPoints, row.pointType)}</td>
                    <td className="px-4 py-3 text-right">{preciseMeterFormatter.format(row.reserveMeters)}m</td>
                    <td className="px-4 py-3 text-right">{formatMetersAndKm(row.linearMeters)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMetersAndKm(row.finalMeters)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-[#617080]" colSpan={6}>
                    Nenhuma reserva para resumir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function InstallationInputCard({
  label,
  value,
  defaultValue,
  onChange,
  icon,
}: {
  label: string;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
  icon?: ReactNode;
}) {
  return (
    <div className="min-h-24 border border-[#d8dee6] bg-[#fbfcfd] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#617080]">
        {icon}
        <span>{label}</span>
      </div>
      <InstallationNumberInput className="mt-3 w-24" value={value} defaultValue={defaultValue} onChange={onChange} />
    </div>
  );
}

function InstallationRangeInputCard({
  label,
  conservativeValue,
  optimisticValue,
  conservativeDefault,
  optimisticDefault,
  onConservativeChange,
  onOptimisticChange,
}: {
  label: string;
  conservativeValue: number;
  optimisticValue: number;
  conservativeDefault: number;
  optimisticDefault: number;
  onConservativeChange: (value: number) => void;
  onOptimisticChange: (value: number) => void;
}) {
  return (
    <div className="min-h-24 border border-[#d8dee6] bg-[#fbfcfd] p-3">
      <p className="text-xs font-semibold uppercase text-[#617080]">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="min-w-0 text-xs font-medium text-[#617080]">
          Conservador
          <InstallationNumberInput className="mt-1 w-full" value={conservativeValue} defaultValue={conservativeDefault} onChange={onConservativeChange} />
        </label>
        <label className="min-w-0 text-xs font-medium text-[#617080]">
          Otimista
          <InstallationNumberInput className="mt-1 w-full" value={optimisticValue} defaultValue={optimisticDefault} onChange={onOptimisticChange} />
        </label>
      </div>
    </div>
  );
}

function InstallationNumberInput({
  value,
  defaultValue,
  onChange,
  className,
}: {
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <input
      type="number"
      min={1}
      step={1}
      className={`h-9 rounded-md border border-[#cbd3dc] bg-white px-2 text-sm font-semibold ${className ?? ''}`}
      value={value}
      onChange={(event) => onChange(normalizeInstallationInput(event.target.value, defaultValue))}
      onBlur={(event) => onChange(normalizeInstallationInput(event.target.value, defaultValue))}
    />
  );
}

function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'muted' }) {
  const className =
    tone === 'muted'
      ? 'inline-flex min-w-14 justify-center rounded-md bg-[#eef2f5] px-2 py-1 text-xs font-semibold text-[#526171]'
      : 'inline-flex min-w-20 justify-center rounded-md bg-[#dce8f2] px-2 py-1 text-xs font-semibold text-[#17324a]';
  return <span className={className}>{children}</span>;
}

function InstallationInfoCard({ label, value, icon }: { label: string; value: string | number; icon?: ReactNode }) {
  return (
    <div className="min-h-24 rounded-md border border-[#d8dee6] bg-[#fbfcfd] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#617080]">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold leading-snug text-[#17324a]">{typeof value === 'number' ? numberFormatter.format(value) : value}</p>
    </div>
  );
}

function InstallationScenario({
  title,
  ceoDays,
  ctoDays,
  totalDays,
  endDate,
}: {
  title: string;
  ceoDays: number;
  ctoDays: number;
  totalDays: number;
  endDate: string;
}) {
  return (
    <div className="rounded-md border border-[#d8dee6] bg-white p-4">
      <h4 className="font-semibold text-[#17324a]">{title}</h4>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-[#617080]">CEO</dt>
        <dd className="text-right font-medium">{formatDays(ceoDays)}</dd>
        <dt className="text-[#617080]">CTO</dt>
        <dd className="text-right font-medium">{formatDays(ctoDays)}</dd>
        <dt className="border-t border-[#edf0f3] pt-2 text-[#617080]">Total</dt>
        <dd className="border-t border-[#edf0f3] pt-2 text-right font-semibold">{formatDays(totalDays)}</dd>
        <dt className="text-[#617080]">Data final estimada</dt>
        <dd className="text-right font-medium">{endDate || '-'}</dd>
      </dl>
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
    <section className="mt-5 overflow-hidden rounded-lg border border-[#d8dee6] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#d8dee6] bg-[#fbfcfd] px-4 py-3">
        <div>
          <h3 className="font-semibold">Resumo de cabos</h3>
          <p className="text-xs text-[#617080]">Metragem linear original por setor, grupo e tipo de cabo</p>
        </div>
        <span className="rounded-md border border-[#cbd3dc] bg-white px-2 py-1 text-xs font-medium text-[#526171]">{numberFormatter.format(rows.length)} linha(s)</span>
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
                <tr key={`${row.sector}-${row.group}-${row.cable}`} className="border-t border-[#edf0f3] hover:bg-[#fbfcfd]">
                  <td className="px-4 py-3 font-medium">{row.sector}</td>
                  <td className="px-4 py-3"><Pill>{row.group}</Pill></td>
                  <td className="px-4 py-3 font-medium">{row.cable}</td>
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
    <section className="mt-5 overflow-hidden rounded-lg border border-[#d8dee6] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#d8dee6] bg-[#fbfcfd] px-4 py-3">
        <div>
          <h3 className="font-semibold">Resumo por setor</h3>
          <p className="text-xs text-[#617080]">Quantidades e metragem base sem reserva técnica</p>
        </div>
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
                <tr key={`${row.sector}-${row.type}`} className="border-t border-[#edf0f3] hover:bg-[#fbfcfd]">
                  <td className="px-4 py-3 font-medium">{row.sector}</td>
                  <td className="px-4 py-3"><Pill tone="muted">{row.type}</Pill></td>
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
    <div className="min-h-24 rounded-lg border border-[#d8dee6] bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase text-[#617080]">{label}</p>
      <p className="mt-3 truncate text-2xl font-semibold text-[#17324a]">{typeof value === 'number' ? numberFormatter.format(value) : value}</p>
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
    RAMAL: { quantity: 0, meters: 0, km: 0 },
    BACKBONE: { quantity: 0, meters: 0, km: 0 },
  };

  for (const row of rows) {
    totals[row.group].quantity += row.quantity;
    totals[row.group].meters += row.meters;
    totals[row.group].km = totals[row.group].meters / 1000;
  }

  return totals;
}

interface TechnicalReservePoint {
  id: string;
  name: string;
  type: 'CTO' | 'CEO';
  distanceMeters: number;
}

interface IgnoredTechnicalReservePoint {
  id: string;
  name: string;
  type: 'CTO' | 'CEO';
  reason: string;
}

interface TechnicalReserveRow {
  id: string;
  name: string;
  sector: string;
  reference: string;
  parentFolderName: string;
  parentFolderPath: string;
  indexInsideParentFolder: number;
  group: CableGroup;
  cable: CableType;
  fullPath: string;
  pointType: 'CTO' | 'CEO';
  validPoints: TechnicalReservePoint[];
  ignoredPoints: IgnoredTechnicalReservePoint[];
  quantityPoints: number;
  linearMeters: number;
  reserveMeters: number;
  finalMeters: number;
}

interface TechnicalReserveSummaryRow {
  cable: CableType;
  group: CableGroup;
  pointType: 'CTO' | 'CEO';
  quantityPoints: number;
  reserveMeters: number;
  linearMeters: number;
  finalMeters: number;
}

function calculateTechnicalReserve(items: AnalyzedItem[]): TechnicalReserveRow[] {
  const points = items.filter((item): item is AnalyzedItem & { type: 'CTO' | 'CEO' } => (item.type === 'CTO' || item.type === 'CEO') && item.coordinates.length > 0);
  const rows: TechnicalReserveRow[] = [];
  const indexesByParentPath = new Map<string, number>();

  for (const cable of items) {
    if (!cable.cableGroup || !cable.cableType || cable.coordinates.length < 2) continue;

    const parentReference = buildCableParentReference(cable);
    const nextIndex = (indexesByParentPath.get(parentReference.parentFolderPath) ?? 0) + 1;
    indexesByParentPath.set(parentReference.parentFolderPath, nextIndex);

    try {
      const allowedPointTypes = cable.allowedPointTypes ?? [];
      const ignoredPointTypes = cable.ignoredPointTypes ?? [];
      const validPoints: TechnicalReservePoint[] = [];
      const ignoredPoints: IgnoredTechnicalReservePoint[] = [];
      const countedKeys = new Set<string>();

      for (const point of points) {
        const pointCoordinate = point.coordinates[0];
        const distanceMeters = distancePointToLineStringMeters(pointCoordinate, cable.coordinates);
        if (distanceMeters > TOLERANCIA_CONEXAO_METROS) continue;

        const uniqueKey = `${cable.id}:${point.id}`;
        if (countedKeys.has(uniqueKey)) continue;
        countedKeys.add(uniqueKey);

        if (allowedPointTypes.includes(point.type)) {
          validPoints.push({
            id: point.id,
            name: point.name,
            type: point.type,
            distanceMeters,
          });
          continue;
        }

        if (ignoredPointTypes.includes(point.type)) {
          ignoredPoints.push({
            id: point.id,
            name: point.name,
            type: point.type,
            reason: `${point.type} ignorado para ${cable.cableGroup}`,
          });
        }
      }

      const quantityPoints = validPoints.length;
      const reserveMeters = quantityPoints * RESERVA_POR_PONTO_METROS;
      rows.push({
        id: cable.id,
        name: cable.name,
        sector: cable.sector,
        reference: `${parentReference.parentFolderName}.${nextIndex}`,
        parentFolderName: parentReference.parentFolderName,
        parentFolderPath: parentReference.parentFolderPath,
        indexInsideParentFolder: nextIndex,
        group: cable.cableGroup,
        cable: cable.cableType,
        fullPath: cable.fullPath,
        pointType: cable.cableGroup === 'RAMAL' ? 'CTO' : 'CEO',
        validPoints,
        ignoredPoints,
        quantityPoints,
        linearMeters: cable.meters,
        reserveMeters,
        finalMeters: cable.meters + reserveMeters,
      });
    } catch {
      rows.push({
        id: cable.id,
        name: cable.name,
        sector: cable.sector,
        reference: `${parentReference.parentFolderName}.${nextIndex}`,
        parentFolderName: parentReference.parentFolderName,
        parentFolderPath: parentReference.parentFolderPath,
        indexInsideParentFolder: nextIndex,
        group: cable.cableGroup,
        cable: cable.cableType,
        fullPath: cable.fullPath,
        pointType: cable.cableGroup === 'RAMAL' ? 'CTO' : 'CEO',
        validPoints: [],
        ignoredPoints: [],
        quantityPoints: 0,
        linearMeters: cable.meters,
        reserveMeters: 0,
        finalMeters: cable.meters,
      });
    }
  }

  return rows.sort((a, b) => {
    const sectorSort = a.sector.localeCompare(b.sector);
    if (sectorSort !== 0) return sectorSort;
    const groupSort = a.group.localeCompare(b.group);
    if (groupSort !== 0) return groupSort;
    return CABLE_TYPES.indexOf(a.cable) - CABLE_TYPES.indexOf(b.cable);
  });
}

function buildTechnicalReserveSummary(rows: TechnicalReserveRow[]): TechnicalReserveSummaryRow[] {
  const grouped = new Map<string, TechnicalReserveSummaryRow>();

  for (const row of rows) {
    const key = `${row.group}:${row.cable}`;
    const current = grouped.get(key) ?? {
      cable: row.cable,
      group: row.group,
      pointType: row.pointType,
      quantityPoints: 0,
      reserveMeters: 0,
      linearMeters: 0,
      finalMeters: 0,
    };
    current.quantityPoints += row.quantityPoints;
    current.reserveMeters += row.reserveMeters;
    current.linearMeters += row.linearMeters;
    current.finalMeters += row.finalMeters;
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const groupSort = a.group.localeCompare(b.group);
    if (groupSort !== 0) return groupSort;
    return CABLE_TYPES.indexOf(a.cable) - CABLE_TYPES.indexOf(b.cable);
  });
}

function buildCableParentReference(cable: AnalyzedItem): { parentFolderName: string; parentFolderPath: string } {
  if (cable.parentFolder) {
    return {
      parentFolderName: cable.parentFolder,
      parentFolderPath: cable.ancestors.join(' > ') || cable.parentFolder,
    };
  }

  const cabosIndex = cable.ancestors.findIndex((ancestor) => ancestor.toUpperCase() === 'CABOS');
  const fallbackFolder = cabosIndex >= 0 ? cable.ancestors[cabosIndex + 1] : undefined;
  if (fallbackFolder) {
    return {
      parentFolderName: fallbackFolder,
      parentFolderPath: cable.ancestors.slice(0, cabosIndex + 2).join(' > '),
    };
  }

  if (cable.sector) {
    return {
      parentFolderName: cable.sector,
      parentFolderPath: cable.sector,
    };
  }

  return {
    parentFolderName: 'SEM REFERÊNCIA',
    parentFolderPath: 'SEM REFERÊNCIA',
  };
}

function distancePointToLineStringMeters(point: Coordinate, lineCoordinates: Coordinate[]): number {
  let shortestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < lineCoordinates.length; index += 1) {
    shortestDistance = Math.min(shortestDistance, distancePointToSegmentMeters(point, lineCoordinates[index - 1], lineCoordinates[index]));
  }

  return shortestDistance;
}

function distancePointToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const originLatRadians = toRadians((point.lat + start.lat + end.lat) / 3);
  const pointXY = coordinateToLocalMeters(point, originLatRadians);
  const startXY = coordinateToLocalMeters(start, originLatRadians);
  const endXY = coordinateToLocalMeters(end, originLatRadians);
  const segmentX = endXY.x - startXY.x;
  const segmentY = endXY.y - startXY.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(pointXY.x - startXY.x, pointXY.y - startXY.y);
  }

  const projection = ((pointXY.x - startXY.x) * segmentX + (pointXY.y - startXY.y) * segmentY) / segmentLengthSquared;
  const clampedProjection = Math.max(0, Math.min(1, projection));
  const closestX = startXY.x + clampedProjection * segmentX;
  const closestY = startXY.y + clampedProjection * segmentY;
  return Math.hypot(pointXY.x - closestX, pointXY.y - closestY);
}

function coordinateToLocalMeters(coordinate: Coordinate, originLatRadians: number): { x: number; y: number } {
  const earthRadiusMeters = 6371008.8;
  return {
    x: toRadians(coordinate.lng) * earthRadiusMeters * Math.cos(originLatRadians),
    y: toRadians(coordinate.lat) * earthRadiusMeters,
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function formatMetersAndKm(meters: number): string {
  return `${preciseMeterFormatter.format(meters)}m / ${preciseKmFormatter.format(meters / 1000)}km`;
}

function formatPointCount(quantity: number, pointType: 'CTO' | 'CEO'): string {
  return `${numberFormatter.format(quantity)} ${pointType}${quantity === 1 ? '' : 's'}`;
}

interface InstallationSettings {
  technicians: number;
  ceoConservative: number;
  ceoOptimistic: number;
  ctoConservative: number;
  ctoOptimistic: number;
}

interface InstallationEstimate {
  capacity: {
    ceoConservative: number;
    ceoOptimistic: number;
    ctoConservative: number;
    ctoOptimistic: number;
  };
  ceo: {
    quantity: number;
    conservative: number;
    optimistic: number;
  };
  cto: {
    quantity: number;
    conservative: number;
    optimistic: number;
  };
  total: {
    conservative: number;
    optimistic: number;
  };
  endDate: {
    conservative: string;
    optimistic: string;
  };
}

function calculateInstallation({
  totalCEO,
  totalCTO,
  startDate,
  businessDaysOnly,
  settings,
}: {
  totalCEO: number;
  totalCTO: number;
  startDate: string;
  businessDaysOnly: boolean;
  settings: InstallationSettings;
}): InstallationEstimate {
  const normalizedSettings = normalizeInstallationSettings(settings);
  const ceoDailyConservative = normalizedSettings.technicians * normalizedSettings.ceoConservative;
  const ceoDailyOptimistic = normalizedSettings.technicians * normalizedSettings.ceoOptimistic;
  const ctoDailyConservative = normalizedSettings.technicians * normalizedSettings.ctoConservative;
  const ctoDailyOptimistic = normalizedSettings.technicians * normalizedSettings.ctoOptimistic;
  const ceoConservative = Math.ceil(totalCEO / ceoDailyConservative);
  const ceoOptimistic = Math.ceil(totalCEO / ceoDailyOptimistic);
  const ctoConservative = Math.ceil(totalCTO / ctoDailyConservative);
  const ctoOptimistic = Math.ceil(totalCTO / ctoDailyOptimistic);
  const totalConservative = ceoConservative + ctoConservative;
  const totalOptimistic = ceoOptimistic + ctoOptimistic;

  return {
    capacity: {
      ceoConservative: ceoDailyConservative,
      ceoOptimistic: ceoDailyOptimistic,
      ctoConservative: ctoDailyConservative,
      ctoOptimistic: ctoDailyOptimistic,
    },
    ceo: {
      quantity: totalCEO,
      conservative: ceoConservative,
      optimistic: ceoOptimistic,
    },
    cto: {
      quantity: totalCTO,
      conservative: ctoConservative,
      optimistic: ctoOptimistic,
    },
    total: {
      conservative: totalConservative,
      optimistic: totalOptimistic,
    },
    endDate: {
      conservative: formatEndDate(startDate, totalConservative, businessDaysOnly),
      optimistic: formatEndDate(startDate, totalOptimistic, businessDaysOnly),
    },
  };
}

function formatDays(days: number): string {
  return `${numberFormatter.format(days)} ${days === 1 ? 'dia' : 'dias'}`;
}

function formatEndDate(startDate: string, days: number, businessDaysOnly: boolean): string {
  const date = parseDateInput(startDate);
  if (!date) return '';
  if (businessDaysOnly) {
    addProductiveDays(date, days);
    return date.toLocaleDateString('pt-BR');
  }
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('pt-BR');
}

function addProductiveDays(date: Date, days: number): void {
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day >= 1 && day <= 5) {
      remaining -= 1;
    } else if (day === 6) {
      remaining -= 0.5;
    }
  }
}

function normalizeInstallationInput(value: string, defaultValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
  return Math.max(1, Math.floor(parsed));
}

function normalizeInstallationSettings(settings: InstallationSettings): InstallationSettings {
  return {
    technicians: normalizeInstallationValue(settings.technicians, DEFAULT_INSTALLATION_SETTINGS.technicians),
    ceoConservative: normalizeInstallationValue(settings.ceoConservative, DEFAULT_INSTALLATION_SETTINGS.ceoConservative),
    ceoOptimistic: normalizeInstallationValue(settings.ceoOptimistic, DEFAULT_INSTALLATION_SETTINGS.ceoOptimistic),
    ctoConservative: normalizeInstallationValue(settings.ctoConservative, DEFAULT_INSTALLATION_SETTINGS.ctoConservative),
    ctoOptimistic: normalizeInstallationValue(settings.ctoOptimistic, DEFAULT_INSTALLATION_SETTINGS.ctoOptimistic),
  };
}

function normalizeInstallationValue(value: number, defaultValue: number): number {
  if (!Number.isFinite(value) || value < 1) return defaultValue;
  return Math.max(1, Math.floor(value));
}

function parseDateInput(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}
