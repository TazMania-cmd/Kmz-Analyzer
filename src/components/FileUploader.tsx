import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { FileArchive, UploadCloud } from 'lucide-react';

type FileUploaderProps = {
  fileName?: string;
  isLoading: boolean;
  onFileSelected: (file: File) => void;
  compact?: boolean;
};

export function FileUploader({ fileName, isLoading, onFileSelected, compact = false }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
    event.target.value = '';
  }

  if (compact) {
    return (
      <section
        className={`flex h-11 min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 transition ${
          isDragging ? 'border-teal-400 bg-teal-950/60' : 'border-slate-700 bg-slate-900 hover:border-teal-500'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
      >
        <div className="flex min-w-0 items-center gap-3">
          <UploadCloud size={18} className="shrink-0 text-teal-300" aria-hidden />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100">{fileName ? 'Arquivo carregado' : 'Solte ou selecione KMZ/KML'}</div>
            <div className="truncate text-[11px] text-slate-400">{fileName ?? 'Processamento local no navegador'}</div>
          </div>
        </div>
        <button
          className="shrink-0 rounded bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
          disabled={isLoading}
          type="button"
        >
          Abrir
        </button>
        <input ref={inputRef} className="hidden" type="file" accept=".kmz,.kml" onChange={handleInput} />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div
        className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
          isDragging ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-slate-50 hover:border-teal-400 hover:bg-white'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <UploadCloud size={28} aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-slate-950">Arraste seu KMZ ou KML aqui</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
          O processamento acontece localmente no navegador. Arquivos de ate 50 MB sao aceitos.
        </p>
        <button
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          type="button"
        >
          <FileArchive size={18} aria-hidden />
          Selecionar arquivo
        </button>
        {fileName ? <p className="mt-4 text-sm font-medium text-slate-700">{fileName}</p> : null}
      </div>
      <input ref={inputRef} className="hidden" type="file" accept=".kmz,.kml" onChange={handleInput} />
    </section>
  );
}
