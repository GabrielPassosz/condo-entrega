"use client";

import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  FileImage,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  Sparkles,
  Upload,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Resident } from "../lib/types";

type Candidate = Pick<
  Resident,
  "id" | "name" | "unit" | "block" | "apartment"
> & {
  score: number;
  reasons: string[];
};

type RegistrationResult = {
  package: {
    id: number;
    residentName: string;
    unit: string;
    pickupCode: string;
    photoUrl: string;
  };
  notification: {
    status: "sent" | "failed" | "not_configured";
    error?: string;
  };
};

type BarcodeResult = { rawValue: string };
type BarcodeDetectorInstance = { detect(source: ImageBitmap): Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type OcrWorker = {
  recognize(
    image: File,
    options?: { rotateAuto?: boolean },
  ): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  } as ImageBitmapOptions);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a foto.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) throw new Error("Não foi possível compactar a foto.");
  return new File([blob], "etiqueta-encomenda.jpg", { type: "image/jpeg" });
}

async function detectBarcode(file: File) {
  const Constructor = (globalThis as typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }).BarcodeDetector;
  if (!Constructor) return "";
  try {
    const bitmap = await createImageBitmap(file);
    const detector = new Constructor({
      formats: ["qr_code", "code_128", "code_39", "ean_13", "data_matrix", "aztec"],
    });
    const results = await detector.detect(bitmap);
    bitmap.close();
    return results[0]?.rawValue?.trim() ?? "";
  } catch {
    return "";
  }
}

function StepBadge({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
          done
            ? "bg-[#0d7658] text-white"
            : active
              ? "bg-[#f3b93f] text-[#3c2b06]"
              : "bg-slate-100 text-slate-400"
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : number}
      </span>
      <span className={`hidden truncate text-xs font-semibold sm:block ${active || done ? "text-slate-800" : "text-slate-400"}`}>
        {label}
      </span>
    </div>
  );
}

export function ReceivePackage({
  residents,
  onRegistered,
}: {
  residents: Resident[];
  onRegistered: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanText, setScanText] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const setPreparedPhoto = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem da etiqueta.");
      return;
    }
    setBusy(true);
    try {
      const prepared = await compressImage(file);
      if (preview) URL.revokeObjectURL(preview);
      setPhoto(prepared);
      setPreview(URL.createObjectURL(prepared));
      setScanText("");
      setTrackingCode("");
      setCandidates([]);
      setSelectedResidentId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir a foto.");
    } finally {
      setBusy(false);
    }
  };

  const openCamera = async () => {
    setCameraError("");
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      inputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError("A câmera não foi liberada. Use o botão para escolher uma foto.");
    }
  };

  const captureCamera = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (blob) {
      stopCamera();
      await setPreparedPhoto(new File([blob], "foto-camera.jpg", { type: "image/jpeg" }));
    }
  };

  const matchResidents = async (text: string, barcode: string) => {
    const response = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanText: text, barcode }),
    });
    const payload = (await response.json()) as { error?: string; candidates?: Candidate[] };
    if (!response.ok) throw new Error(payload.error || "Não foi possível buscar o morador.");
    setCandidates(payload.candidates ?? []);
    if (payload.candidates?.[0]?.score && payload.candidates[0].score >= 85) {
      setSelectedResidentId(payload.candidates[0].id);
    }
  };

  const analyze = async () => {
    if (!photo) {
      setError("Tire uma foto nítida da etiqueta primeiro.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress(2);
    setStatusText("Procurando QR Code e código de barras…");
    setStep(2);
    let worker: OcrWorker | null = null;
    try {
      const barcode = await detectBarcode(photo);
      setTrackingCode(barcode);
      setStatusText("Lendo o nome e a unidade na etiqueta…");
      // O Tesseract depende de APIs exclusivas do navegador. O carregamento
      // tardio impede que o módulo seja executado pelo Worker durante o SSR.
      const { createWorker, OEM } = await import("tesseract.js");
      worker = (await createWorker("por", OEM.LSTM_ONLY, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setProgress(Math.max(8, Math.round(message.progress * 100)));
          }
        },
      })) as unknown as OcrWorker;
      const recognized = await worker.recognize(photo, { rotateAuto: true });
      const text = recognized.data.text.trim();
      setScanText(text);
      setProgress(100);
      setStatusText("Comparando com a lista de moradores…");
      await matchResidents(text, barcode);
      setStep(3);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A leitura automática falhou.";
      setError(`${message} Você pode conferir os dados manualmente abaixo.`);
      setStep(3);
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setBusy(false);
    }
  };

  const searchAgain = async () => {
    setBusy(true);
    setError("");
    try {
      await matchResidents(scanText, trackingCode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na busca.");
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (!photo || !selectedResidentId) {
      setError("Confirme a foto e o morador.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("photo", photo);
      form.set("residentId", String(selectedResidentId));
      form.set("description", description);
      form.set("trackingCode", trackingCode);
      form.set("scanText", scanText);
      const response = await fetch("/api/encomendas", { method: "POST", body: form });
      const payload = (await response.json()) as RegistrationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar a encomenda.");
      setResult(payload);
      setStep(4);
      await onRegistered();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao registrar.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setStep(1);
    setPhoto(null);
    setPreview("");
    setScanText("");
    setTrackingCode("");
    setCandidates([]);
    setSelectedResidentId(null);
    setDescription("");
    setError("");
    setResult(null);
  };

  const selected = residents.find((resident) => resident.id === selectedResidentId);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d7658]">Recebimento inteligente</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Nova encomenda</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Fotografe a etiqueta inteira. O sistema procura o código, lê o destinatário e sugere o morador correto.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:px-5">
        <StepBadge number={1} label="Fotografar" active={step === 1} done={step > 1} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepBadge number={2} label="Ler etiqueta" active={step === 2} done={step > 2} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepBadge number={3} label="Confirmar" active={step === 3} done={step > 3} />
        <div className="h-px flex-1 bg-slate-200" />
        <StepBadge number={4} label="Avisar" active={step === 4} done={false} />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 1 && (
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            {preview ? (
              <div className="relative overflow-hidden rounded-2xl bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Foto da etiqueta" className="max-h-[520px] w-full object-contain" />
                <button
                  onClick={() => {
                    setPhoto(null);
                    setPreview("");
                  }}
                  className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white backdrop-blur"
                  aria-label="Remover foto"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="soft-grid grid min-h-[330px] place-items-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center">
                <div>
                  <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white text-[#0d7658] shadow-lg shadow-emerald-950/10">
                    <ScanLine className="h-9 w-9" />
                  </span>
                  <h2 className="mt-5 text-xl font-bold">Enquadre toda a etiqueta</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    Evite reflexos e mantenha nome, bloco, apartamento e código visíveis.
                  </p>
                </div>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void setPreparedPhoto(file);
                event.target.value = "";
              }}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => void openCamera()}
                disabled={busy}
                className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#0d7658] px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Camera className="h-5 w-5" /> Abrir câmera
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 disabled:opacity-50"
              >
                <Upload className="h-5 w-5" /> Escolher foto
              </button>
            </div>
            {cameraError && <p className="mt-3 text-center text-xs text-amber-700">{cameraError}</p>}
          </div>

          <aside className="rounded-3xl bg-[#102c24] p-6 text-white shadow-xl shadow-emerald-950/10">
            <Sparkles className="h-7 w-7 text-[#f3b93f]" />
            <h2 className="mt-5 text-xl font-bold">O que será verificado</h2>
            <div className="mt-5 space-y-4 text-sm text-emerald-50/80">
              {["QR Code ou código de rastreamento", "Nome completo do destinatário", "Bloco, apartamento ou casa", "Correspondência com o cadastro"].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f3b93f]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => void analyze()}
              disabled={!photo || busy}
              className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#f3b93f] px-5 text-sm font-bold text-[#3c2b06] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <PackageSearch className="h-5 w-5" />}
              Ler etiqueta
            </button>
          </aside>
        </section>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black">
          <div className="flex items-center justify-between p-4 text-white">
            <strong>Fotografar etiqueta</strong>
            <button onClick={stopCamera} className="grid h-11 w-11 place-items-center rounded-full bg-white/10" aria-label="Fechar câmera">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-white/70">
              <div className="scan-line absolute inset-x-3 top-3 h-0.5 bg-[#f3b93f] shadow-[0_0_14px_#f3b93f]" />
            </div>
          </div>
          <div className="safe-bottom flex justify-center bg-black p-6">
            <button onClick={() => void captureCamera()} className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-[#f3b93f] text-black shadow-xl" aria-label="Tirar foto">
              <Camera className="h-8 w-8" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-emerald-50 text-[#0d7658]">
            <ScanLine className="h-10 w-10 animate-pulse" />
          </div>
          <h2 className="mt-6 text-2xl font-bold">Lendo a etiqueta</h2>
          <p className="mt-2 text-sm text-slate-500">{statusText}</p>
          <div className="mx-auto mt-7 h-3 max-w-xl overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#0d7658] transition-all duration-300" style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
          <p className="mt-3 text-xs font-semibold text-[#0d7658]">{progress}%</p>
        </section>
      )}

      {step === 3 && (
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <FileImage className="h-5 w-5 text-[#0d7658]" />
              <h2 className="font-bold">Informações lidas</h2>
            </div>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Etiqueta analisada" className="mt-4 max-h-56 w-full rounded-2xl bg-slate-100 object-contain" />
            )}
            <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Código encontrado
              <input
                value={trackingCode}
                onChange={(event) => setTrackingCode(event.target.value)}
                placeholder="Código de rastreamento"
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal text-slate-900"
              />
            </label>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Texto da etiqueta
              <textarea
                value={scanText}
                onChange={(event) => setScanText(event.target.value)}
                placeholder="Corrija ou digite nome, bloco e apartamento"
                rows={7}
                className="mt-2 w-full rounded-xl border border-slate-200 p-4 text-sm font-normal leading-6 text-slate-900"
              />
            </label>
            <button
              onClick={() => void searchAgain()}
              disabled={busy || !scanText.trim()}
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-bold text-[#0d7658] disabled:opacity-40"
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar novamente
            </button>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0d7658]">Confirmação obrigatória</p>
                <h2 className="mt-1 text-xl font-bold">Qual é o morador?</h2>
              </div>
              <UserRoundCheck className="h-7 w-7 text-[#0d7658]" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">Nenhuma mensagem será enviada antes da sua confirmação.</p>

            <div className="mt-5 space-y-3">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedResidentId(candidate.id)}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                    selectedResidentId === candidate.id
                      ? "border-[#0d7658] bg-emerald-50 ring-2 ring-emerald-100"
                      : "border-slate-200 hover:border-emerald-200"
                  }`}
                >
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold ${selectedResidentId === candidate.id ? "bg-[#0d7658] text-white" : "bg-slate-100 text-slate-500"}`}>
                    {candidate.score}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{candidate.name}</strong>
                    <span className="mt-1 block truncate text-xs text-slate-500">{candidate.unit}</span>
                    {candidate.reasons.length > 0 && <span className="mt-1 block text-[11px] text-[#0d7658]">Confere: {candidate.reasons.join(", ")}</span>}
                  </span>
                  {selectedResidentId === candidate.id && <CheckCircle2 className="h-6 w-6 shrink-0 text-[#0d7658]" />}
                </button>
              ))}
            </div>

            <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Ou selecione manualmente
              <select
                value={selectedResidentId ?? ""}
                onChange={(event) => setSelectedResidentId(Number(event.target.value) || null)}
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900"
              >
                <option value="">Escolha o morador</option>
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>{resident.unit} — {resident.name}</option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Descrição opcional
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ex.: caixa pequena, Mercado Livre"
                maxLength={300}
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal text-slate-900"
              />
            </label>

            {selected && (
              <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm">
                <span className="text-slate-500">Mensagem será enviada para</span>
                <strong className="mt-1 block">{selected.name} · {selected.phone}</strong>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-[0.4fr_1fr]">
              <button onClick={() => setStep(1)} className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-slate-200 font-bold text-slate-600">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <button
                onClick={() => void register()}
                disabled={!selectedResidentId || busy}
                className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#0d7658] px-5 font-bold text-white disabled:opacity-40"
              >
                {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                Confirmar, registrar e avisar
              </button>
            </div>
          </section>
        </div>
      )}

      {step === 4 && result && (
        <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white text-center shadow-xl shadow-emerald-950/5">
          <div className="bg-emerald-50 px-6 py-9">
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#0d7658] text-white shadow-lg shadow-emerald-950/20">
              <CheckCircle2 className="h-10 w-10" />
            </span>
            <h2 className="mt-5 text-2xl font-bold">Encomenda registrada</h2>
            <p className="mt-2 text-sm text-slate-600">{result.package.residentName} · {result.package.unit}</p>
          </div>
          <div className="px-6 py-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Código de retirada</p>
            <strong className="mt-2 block font-mono text-4xl tracking-[0.25em] text-[#0d7658]">{result.package.pickupCode}</strong>
            <div className={`mx-auto mt-6 max-w-md rounded-2xl p-4 text-sm ${result.notification.status === "sent" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {result.notification.status === "sent"
                ? "WhatsApp enviado com a foto da encomenda."
                : `A encomenda foi salva, mas o aviso não foi enviado: ${result.notification.error || "verifique a conexão."}`}
            </div>
            <button onClick={reset} className="mt-6 inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#0d7658] px-6 font-bold text-white">
              <RefreshCw className="h-5 w-5" /> Receber outra encomenda
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
