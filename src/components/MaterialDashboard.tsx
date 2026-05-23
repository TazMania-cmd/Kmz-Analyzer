import { useMemo, useState } from 'react';
import { Calculator, PackageSearch, SearchCode } from 'lucide-react';
import {
  AnalysisResult,
  CableSize,
  MaterialEstimateRow,
  MaterialOriginType,
  MaterialTotal,
  MaterialUnit,
} from '../types/kmz';
import { formatNumber } from '../utils/exportReport';

type MaterialDashboardProps = {
  result: AnalysisResult;
};

export function MaterialDashboard({ result }: MaterialDashboardProps) {
  const [sector, setSector] = useState('all');
  const [materialType, setMaterialType] = useState('all');
  const [unit, setUnit] = useState<'all' | MaterialUnit>('all');
  const [origin, setOrigin] = useState<'all' | MaterialOriginType>('all');
  const [manualCableMap, setManualCableMap] = useState<Record<string, CableSize | ''>>({});

  const materialData = useMemo(() => applyManualCableMappings(result, manualCableMap), [manualCableMap, result]);

  const rows = useMemo(
    () =>
      materialData.rows.filter((row) => {
        return (
          (sector === 'all' || row.sectorId === sector) &&
          (materialType === 'all' || row.material === materialType) &&
          (unit === 'all' || row.unit === unit) &&
          (origin === 'all' || row.originType === origin)
        );
      }),
    [materialData.rows, materialType, origin, sector, unit],
  );

  const materialOptions = unique([...materialData.rows.map((row) => row.material), ...materialData.sourceItems.map((item) => item.material)]);
  const unitOptions = unique(materialData.rows.map((row) => row.unit));
  const originOptions = unique(materialData.rows.map((row) => row.originType));
  const projectItemNames = ['CTO', 'CEO', 'POSTES', 'OLHAL'];
  const isProjectItemFilter = projectItemNames.includes(materialType);
  const filteredSourceItems = useMemo(
    () =>
      materialData.sourceItems.filter(
        (item) =>
          (sector === 'all' || item.sectorId === sector) &&
          (materialType === 'all' || item.material === materialType),
    ),
    [materialData.sourceItems, materialType, sector],
  );
  const filteredTotal = isProjectItemFilter
    ? filteredSourceItems.reduce((total, item) => total + item.quantity, 0)
    : rows.reduce((total, row) => total + row.quantity, 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-md border border-slate-300 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <PackageSearch size={17} aria-hidden />
          Dashboard de material
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Select label="Setor" value={sector} onChange={setSector} options={result.sectors.map((item) => [item.id, item.name])} />
          <Select label="Item" value={materialType} onChange={setMaterialType} options={materialOptions.map((item) => [item, item])} />
          <Select label="Unidade" value={unit} onChange={(value) => setUnit(value as 'all' | MaterialUnit)} options={unitOptions.map((item) => [item, item])} />
          <Select
            label="Origem"
            value={origin}
            onChange={(value) => setOrigin(value as 'all' | MaterialOriginType)}
            options={originOptions.map((item) => [item, item])}
          />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <MetricCard label={isProjectItemFilter ? 'Itens filtrados' : 'Linhas de material'} value={isProjectItemFilter ? filteredSourceItems.length.toString() : rows.length.toString()} />
        <MetricCard label="Materiais distintos" value={unique(rows.map((row) => row.material)).length.toString()} />
        <MetricCard label="Soma filtrada" value={formatNumber(filteredTotal)} />
      </div>

      <CeoSangriaReserveSection result={result} />

      <CableDebugPanel
        result={result}
        materialRows={materialData.rows}
        manualCableMap={manualCableMap}
        onMapCable={(lineId, size) => setManualCableMap((current) => ({ ...current, [lineId]: size }))}
      />

      <section className="rounded-md border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">SETOR | MATERIAL | UNIDADE | REGRA | QUANTIDADE | ORIGEM</h2>
        </div>
        <div className="max-h-[48vh] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 shadow-sm">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100 px-5 py-3 font-semibold">Setor</th>
                <th className="px-5 py-3 font-semibold">Material</th>
                <th className="px-5 py-3 font-semibold">Unidade</th>
                <th className="px-5 py-3 font-semibold">Regra</th>
                <th className="px-5 py-3 font-semibold">Quantidade</th>
                <th className="px-5 py-3 font-semibold">Origem</th>
                <th className="px-5 py-3 font-semibold">Categoria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className={row.quantity === 0 ? 'text-slate-400' : 'text-slate-700'}>
                  <td className="sticky left-0 bg-white px-5 py-4 font-semibold text-slate-950">{row.sectorName}</td>
                  <td className="px-5 py-4">{row.material}</td>
                  <td className="px-5 py-4">{row.unit}</td>
                  <td className="px-5 py-4">{row.rule}</td>
                  <td className="px-5 py-4 font-semibold text-teal-800">{formatQuantity(row.quantity, row.unit)}</td>
                  <td className="px-5 py-4">{row.origin}</td>
                  <td className="px-5 py-4">{row.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Itens filtrados</h2>
        </div>
        <div className="max-h-[36vh] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 shadow-sm">
              <tr>
                <th className="px-5 py-3 font-semibold">ID</th>
                <th className="px-5 py-3 font-semibold">Nome original</th>
                <th className="px-5 py-3 font-semibold">Descricao</th>
                <th className="px-5 py-3 font-semibold">Material classificado</th>
                <th className="px-5 py-3 font-semibold">Categoria</th>
                <th className="px-5 py-3 font-semibold">Tipo geometria</th>
                <th className="px-5 py-3 font-semibold">Pasta origem</th>
                <th className="px-5 py-3 font-semibold">Motivo da inclusao</th>
                <th className="px-5 py-3 font-semibold">Quantidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSourceItems.map((item) => (
                <tr key={item.id} className="text-slate-700">
                  <td className="max-w-[220px] truncate px-5 py-3 font-mono text-xs text-slate-500">{item.id}</td>
                  <td className="px-5 py-3 font-semibold text-slate-950">{item.originalName}</td>
                  <td className="max-w-[260px] truncate px-5 py-3 text-slate-500">{item.description ?? '-'}</td>
                  <td className="px-5 py-3">{item.material}</td>
                  <td className="px-5 py-3">{item.category}</td>
                  <td className="px-5 py-3">{item.geometryType}</td>
                  <td className="px-5 py-3">{item.originFolder}</td>
                  <td className="px-5 py-3">Placemark/Point final classificado como {item.material}</td>
                  <td className="px-5 py-3 font-semibold text-teal-800">{item.quantity}</td>
                </tr>
              ))}
              {filteredSourceItems.length === 0 ? (
                <tr>
                  <td className="px-5 py-5 text-slate-500" colSpan={9}>
                    Nenhum item unitario detalhado para os filtros atuais.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <IgnoredItemsSection result={result} />

      <section className="rounded-md border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Total por material</h2>
        </div>
        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {materialData.totalsByMaterial.map((total) => (
            <article key={total.material} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{total.material}</h3>
                  <p className="text-xs font-medium text-slate-500">{total.unit} - {total.category}</p>
                </div>
                <strong className="text-teal-800">{formatQuantity(total.total, total.unit)}</strong>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(total.bySector).map(([sectorName, quantity]) => (
                  <span key={sectorName} className="rounded bg-white px-2 py-1 text-xs font-medium text-slate-600">
                    {sectorName}: {formatQuantity(quantity, total.unit)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function CeoSangriaReserveSection({ result }: { result: AnalysisResult }) {
  const [sector, setSector] = useState('all');
  const rows = useMemo(() => {
    const totals = new Map<string, { cable: string; quantity: number; meters: number }>();

    result.materials.cableDebug.ceoSangrias
      .filter((ceo) => sector === 'all' || ceo.sectorId === sector)
      .forEach((ceo) => {
        ceo.connectedCables.forEach((connection) => {
          const current = totals.get(connection.cableType) ?? {
            cable: connection.cableType,
            quantity: 0,
            meters: 0,
          };
          current.quantity += 1;
          current.meters += 15;
          totals.set(connection.cableType, current);
        });
      });

    return Array.from(totals.values()).sort((a, b) => a.cable.localeCompare(b.cable));
  }, [result.materials.cableDebug.ceoSangrias, sector]);

  return (
    <section className="rounded-md border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Reserva por CEO de sangria</h2>
          <p className="mt-1 text-sm text-slate-500">Somente reserva adicionada por CEO de sangria, agrupada por cabo.</p>
        </div>
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          value={sector}
          onChange={(event) => setSector(event.target.value)}
        >
          <option value="all">Todos</option>
          {result.sectors.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-5 py-3 font-semibold">Cabo</th>
              <th className="px-5 py-3 font-semibold">Qtd CEO Sangria</th>
              <th className="px-5 py-3 font-semibold">Metragem adicionada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.cable} className="text-slate-700">
                <td className="px-5 py-4 font-semibold text-slate-950">{row.cable}</td>
                <td className="px-5 py-4">{row.quantity} CEO SANGRIA</td>
                <td className="px-5 py-4 font-semibold text-teal-800">{formatNumber(row.meters)}m</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-5 py-5 text-slate-500" colSpan={3}>
                  Nenhuma reserva por CEO de sangria para o filtro selecionado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CableDebugPanel({
  result,
  materialRows,
  manualCableMap,
  onMapCable,
}: {
  result: AnalysisResult;
  materialRows: MaterialEstimateRow[];
  manualCableMap: Record<string, CableSize | ''>;
  onMapCable: (lineId: string, size: CableSize | '') => void;
}) {
  const debug = result.materials.cableDebug;
  const asu06Rows = result.sectors.map((sector) => {
    const totalFinal = materialRows.find((row) => row.sectorId === sector.id && row.material === 'CABO ASU 06 F.O')?.quantity ?? 0;
    const ctoTerminations = debug.ctoAsu06Terminations.filter((item) => item.sectorId === sector.id);
    const reserveCto = ctoTerminations.reduce((total, item) => total + item.reserveMeters, 0);
    const ceoReserve = debug.reserveMetersBySectorAndSize[sector.id]?.['06'] ?? 0;
    return {
      sectorName: sector.name,
      linearMeters: Math.max(0, totalFinal - reserveCto - ceoReserve),
      terminations: ctoTerminations.length,
      reserveCto,
      totalFinal,
    };
  });
  const ctoAsu06Summary = {
    passante: debug.ctoAsu06Terminations.filter((item) => item.type === 'PASSANTE').length,
    final: debug.ctoAsu06Terminations.filter((item) => item.type === 'FINAL').length,
    total: debug.ctoAsu06Terminations.length,
    reserve: debug.ctoAsu06Terminations.reduce((total, item) => total + item.reserveMeters, 0),
  };
  const ctoAsu06GroupedByRamal = groupCtoAsu06ByRamal(debug.ctoAsu06Terminations);

  return (
    <section className="rounded-md border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <SearchCode size={18} className="text-teal-700" aria-hidden />
          <h2 className="text-base font-semibold text-slate-950">Debug de cabos</h2>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="LineStrings encontradas" value={debug.totalLineStrings.toString()} />
        <MetricCard label="LineStrings em cabos" value={debug.cableFolderLineStrings.toString()} />
        <MetricCard label="Cabos classificados" value={debug.classifiedLineStrings.toString()} />
        <MetricCard label="Cabos nao classificados" value={debug.unclassifiedLineStrings.toString()} />
        <MetricCard label="CTOs encontradas" value={countCtos(result).toString()} />
        <MetricCard
          label="Linhas ASU 06"
          value={debug.classifiedLines.filter((line) => line.classifiedAs === 'CABO ASU 06 F.O').length.toString()}
        />
        <MetricCard label="CTOs conectadas ASU 06" value={debug.ctoAsu06Terminations.length.toString()} />
      </div>

      <div className="px-5 pb-5">
        <div className="rounded-md border border-teal-200">
          <div className="border-b border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-950">
            Reserva tecnica CTO - CABO ASU 06 F.O
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-2">Setor</th>
                  <th className="px-4 py-2">Cabo</th>
                  <th className="px-4 py-2">Metragem linear</th>
                  <th className="px-4 py-2">CTOs conectadas</th>
                  <th className="px-4 py-2">Reserva CTO</th>
                  <th className="px-4 py-2">Total final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {asu06Rows.map((row) => (
                  <tr key={row.sectorName}>
                    <td className="px-4 py-2 font-semibold text-slate-950">{row.sectorName}</td>
                    <td className="px-4 py-2">CABO ASU 06 F.O</td>
                    <td className="px-4 py-2">{formatNumber(row.linearMeters)}m</td>
                    <td className="px-4 py-2">{row.terminations}</td>
                    <td className="px-4 py-2">{formatNumber(row.reserveCto)}m</td>
                    <td className="px-4 py-2 font-semibold text-teal-800">{formatNumber(row.totalFinal)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="rounded-md border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
            Reserva ASU 06 por CTO
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-2">Setor</th>
                  <th className="px-4 py-2">Ramal ASU 06</th>
                  <th className="px-4 py-2">CTOs conectadas</th>
                  <th className="px-4 py-2">Reserva total</th>
                  <th className="px-4 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ctoAsu06GroupedByRamal.map((item) => (
                  <RamalCtoReserveRow key={item.cableLineId} item={item} />
                ))}
                {ctoAsu06GroupedByRamal.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={5}>
                      Nenhuma CTO conectada ao ASU 06 detectada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="rounded-md border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
            Resumo reserva ASU 06 por CTO
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-2">Cabo</th>
                  <th className="px-4 py-2">CTO passante</th>
                  <th className="px-4 py-2">CTO final</th>
                  <th className="px-4 py-2">Total CTOs</th>
                  <th className="px-4 py-2">Reserva total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-2 font-semibold text-slate-950">CABO ASU 06 F.O</td>
                  <td className="px-4 py-2">{ctoAsu06Summary.passante}</td>
                  <td className="px-4 py-2">{ctoAsu06Summary.final}</td>
                  <td className="px-4 py-2">{ctoAsu06Summary.total}</td>
                  <td className="px-4 py-2 font-semibold text-teal-800">{formatNumber(ctoAsu06Summary.reserve)}m</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="rounded-md border border-red-200">
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-950">
            CEOs de sangria
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-2">CEO</th>
                  <th className="px-4 py-2">Setor</th>
                  <th className="px-4 py-2">Cabos conectados</th>
                  <th className="px-4 py-2">Debug conexao</th>
                  <th className="px-4 py-2">Reserva total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debug.ceoSangrias.map((ceo) => (
                  <tr key={ceo.ceoId}>
                    <td className="px-4 py-2 font-semibold text-slate-950">{ceo.ceoName}</td>
                    <td className="px-4 py-2">{ceo.sectorName}</td>
                    <td className="px-4 py-2">
                      {ceo.connectedCables.map((connection) => connection.cableType.replace('CABO ', '')).join(', ')}
                    </td>
                    <td className="px-4 py-2">
                      {ceo.connectedCables
                        .map(
                          (connection) =>
                            `${connection.cableType.replace('CABO ', '')}: +15m`,
                        )
                        .join(' | ')}
                    </td>
                    <td className="px-4 py-2 font-semibold text-red-700">{formatNumber(ceo.reserveMeters)}m</td>
                  </tr>
                ))}
                {debug.ceoSangrias.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={5}>
                      Nenhuma CEO de sangria detectada pela analise topologica.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-5 pb-5 xl:grid-cols-2">
        <div className="rounded-md border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
            Cabos classificados
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-2">Setor</th>
                  <th className="px-4 py-2">Nome original</th>
                  <th className="px-4 py-2">Pasta</th>
                  <th className="px-4 py-2">Material</th>
                  <th className="px-4 py-2">Metragem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debug.classifiedLines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-2 font-semibold">{line.sectorName}</td>
                    <td className="px-4 py-2">{line.originalName}</td>
                    <td className="px-4 py-2">{line.originFolder}</td>
                    <td className="px-4 py-2">{line.classifiedAs}</td>
                    <td className="px-4 py-2">{formatNumber(line.meters)}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-md border border-amber-200">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            Cabos nao classificados
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-white text-slate-500">
                <tr>
                  <th className="px-4 py-2">Setor</th>
                  <th className="px-4 py-2">Nome original</th>
                  <th className="px-4 py-2">Pasta</th>
                  <th className="px-4 py-2">Metragem</th>
                  <th className="px-4 py-2">Mapear</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debug.unclassifiedLines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-2 font-semibold">{line.sectorName}</td>
                    <td className="px-4 py-2">{line.originalName}</td>
                    <td className="px-4 py-2">{line.originFolder}</td>
                    <td className="px-4 py-2">{formatNumber(line.meters)}m</td>
                    <td className="px-4 py-2">
                      <select
                        className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                        value={manualCableMap[line.id] ?? ''}
                        onChange={(event) => onMapCable(line.id, event.target.value as CableSize | '')}
                      >
                        <option value="">Nao mapear</option>
                        {(['06', '12', '24', '36', '72', '144'] as CableSize[]).map((size) => (
                          <option key={size} value={size}>
                            CABO ASU {size} F.O
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-950">Nomes originais encontrados no KMZ</h3>
        <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-auto">
          {debug.originalNames.map((name) => (
            <span key={name} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function IgnoredItemsSection({ result }: { result: AnalysisResult }) {
  const ignoredRows = useMemo(() => {
    return result.detectedStructure
      .filter((row) => {
        const isFolder = row.type === 'PASTA PAI' || row.type === 'SUBPASTA';
        const isInvalidPlacemark = row.type === 'PLACEMARK';
        const isMixedGrouping = /CABOS?.*CTO|CTO.*CEO|CABOS?.*CEO/i.test(row.originalName);
        return isFolder || isInvalidPlacemark || isMixedGrouping;
      })
      .slice(0, 300)
      .map((row) => ({
        ...row,
        reason:
          row.type === 'PASTA PAI' || row.type === 'SUBPASTA'
            ? 'Pasta/camada usada apenas como contexto'
            : row.type === 'PLACEMARK'
              ? 'Elemento sem geometria final valida'
              : 'Nome misto tratado como agrupador/contexto',
      }));
  }, [result.detectedStructure]);

  return (
    <section className="rounded-md border border-slate-300 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">Itens ignorados</h2>
      </div>
      <div className="max-h-[30vh] overflow-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-600 shadow-sm">
            <tr>
              <th className="px-5 py-3 font-semibold">Nome original</th>
              <th className="px-5 py-3 font-semibold">Tipo</th>
              <th className="px-5 py-3 font-semibold">Classificacao</th>
              <th className="px-5 py-3 font-semibold">Caminho</th>
              <th className="px-5 py-3 font-semibold">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ignoredRows.map((row) => (
              <tr key={row.id} className="text-slate-700">
                <td className="px-5 py-3 font-semibold text-slate-950">{row.originalName}</td>
                <td className="px-5 py-3">{row.type}</td>
                <td className="px-5 py-3">{row.classification}</td>
                <td className="max-w-[420px] truncate px-5 py-3 text-slate-500">{row.path}</td>
                <td className="px-5 py-3">{row.reason}</td>
              </tr>
            ))}
            {ignoredRows.length === 0 ? (
              <tr>
                <td className="px-5 py-5 text-slate-500" colSpan={5}>
                  Nenhum agrupador ou item invalido detectado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type GroupedCtoAsu06Ramal = {
  cableLineId: string;
  sectorName: string;
  cableName: string;
  ctos: Array<{
    ctoName: string;
    type: string;
    connectionKind: string;
    distanceMeters: number;
  }>;
  reserveMeters: number;
};

function RamalCtoReserveRow({ item }: { item: GroupedCtoAsu06Ramal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="text-slate-700">
        <td className="px-4 py-2 font-semibold text-slate-950">{item.sectorName}</td>
        <td className="px-4 py-2">{item.cableName}</td>
        <td className="px-4 py-2">{item.ctos.length} CTOs</td>
        <td className="px-4 py-2 font-semibold text-teal-800">{formatNumber(item.reserveMeters)}m</td>
        <td className="px-4 py-2">
          <button className="text-xs font-semibold text-teal-700 hover:text-teal-900" type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Ocultar CTOs' : 'Ver CTOs conectadas'}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td className="bg-slate-50 px-4 py-3 text-xs text-slate-600" colSpan={5}>
            <div className="flex flex-wrap gap-2">
              {item.ctos.map((cto) => (
                <span key={`${item.cableLineId}-${cto.ctoName}-${cto.distanceMeters}`} className="rounded bg-white px-2 py-1 shadow-sm">
                  {cto.ctoName} - {cto.type} - {formatNumber(cto.distanceMeters)}m
                </span>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function groupCtoAsu06ByRamal(items: AnalysisResult['materials']['cableDebug']['ctoAsu06Terminations']): GroupedCtoAsu06Ramal[] {
  const grouped = new Map<string, GroupedCtoAsu06Ramal>();

  items.forEach((item) => {
    const current = grouped.get(item.cableLineId) ?? {
      cableLineId: item.cableLineId,
      sectorName: item.sectorName,
      cableName: item.cableName,
      ctos: [],
      reserveMeters: 0,
    };

    current.ctos.push({
      ctoName: item.ctoName,
      type: item.type,
      connectionKind: item.connectionKind,
      distanceMeters: item.distanceMeters,
    });
    current.reserveMeters += item.reserveMeters;
    grouped.set(item.cableLineId, current);
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const sectorCompare = a.sectorName.localeCompare(b.sectorName, 'pt-BR', { numeric: true });
    if (sectorCompare !== 0) return sectorCompare;
    return compareProjectCode(a.cableName, b.cableName);
  });
}

function compareProjectCode(a: string, b: string): number {
  const keyA = extractProjectCodeSortKey(a);
  const keyB = extractProjectCodeSortKey(b);

  if (keyA.main !== keyB.main) return keyA.main - keyB.main;
  if (keyA.sub !== keyB.sub) return keyA.sub - keyB.sub;
  return a.localeCompare(b, 'pt-BR', { numeric: true });
}

function extractProjectCodeSortKey(value: string): { main: number; sub: number } {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const match = normalized.match(/\bM(?:YA|AY)\s*(\d+)(?:\.(\d+))?/);

  if (!match) return { main: Number.MAX_SAFE_INTEGER, sub: Number.MAX_SAFE_INTEGER };

  return {
    main: Number(match[1]),
    sub: match[2] ? Number(match[2]) : 0,
  };
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
      {label}
      <select
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">Todos</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-slate-300 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Calculator size={18} aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-xl font-bold text-slate-950">{value}</p>
    </article>
  );
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function formatQuantity(value: number, unit: MaterialUnit): string {
  const suffix = unit === 'METRO' ? 'm' : unit === 'ROLO' ? ' rolo(s)' : '';
  return `${formatNumber(value)}${suffix}`;
}

function countCtos(result: AnalysisResult): number {
  return result.sectors.reduce((total, sector) => {
    return (
      total +
      sector.placemarks.filter((placemark) => {
        const pathHasCto = placemark.path.some((part) => part.trim().toUpperCase() === 'CTO');
        return placemark.pointCount > 0 && (pathHasCto || /\bCTO\b/i.test(placemark.name));
      }).length
    );
  }, 0);
}

function applyManualCableMappings(result: AnalysisResult, manualCableMap: Record<string, CableSize | ''>) {
  const rows = result.materials.rows.map((row) => ({ ...row }));
  const cableRows = rows.filter((row) => /^CABO ASU \d+ F\.O$/.test(row.material) || row.material === 'CABOS NAO CLASSIFICADOS');

  Object.entries(manualCableMap).forEach(([lineId, size]) => {
    if (!size) return;
    const line = result.materials.cableDebug.unclassifiedLines.find((item) => item.id === lineId);
    if (!line) return;

    const targetMaterial = `CABO ASU ${size} F.O`;
    const targetRow = cableRows.find((row) => row.sectorId === line.sectorId && row.material === targetMaterial);
    const unclassifiedRow = cableRows.find((row) => row.sectorId === line.sectorId && row.material === 'CABOS NAO CLASSIFICADOS');

    if (targetRow) targetRow.quantity += line.meters;
    if (unclassifiedRow) unclassifiedRow.quantity = Math.max(0, unclassifiedRow.quantity - line.meters);
  });

  return {
    rows,
    totalsByMaterial: buildMaterialTotals(rows),
    sourceItems: result.materials.sourceItems,
  };
}

function buildMaterialTotals(rows: MaterialEstimateRow[]): MaterialTotal[] {
  const totals = new Map<string, MaterialTotal>();

  rows.forEach((row) => {
    const current = totals.get(row.material) ?? {
      material: row.material,
      unit: row.unit,
      category: row.category,
      total: 0,
      bySector: {},
    };
    current.total += row.quantity;
    current.bySector[row.sectorName] = (current.bySector[row.sectorName] ?? 0) + row.quantity;
    totals.set(row.material, current);
  });

  return Array.from(totals.values()).map((total) => ({
    ...total,
    total: total.unit === 'METRO' ? Math.round(total.total * 100) / 100 : Math.ceil(total.total),
  }));
}
