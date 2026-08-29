"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clipboard,
  Cloud,
  LoaderCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type WhatsappStatus = {
  configured: boolean;
  state: string;
  connected?: boolean;
  qrAvailable?: boolean;
  qrUpdatedAt?: string | null;
};

async function readJson<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível falar com o serviço do WhatsApp.");
  return payload;
}

function stateLabel(state: string) {
  const labels: Record<string, string> = {
    connected: "Conectado e pronto para enviar",
    waiting_for_scan: "Aguardando leitura do QR Code",
    connecting: "Preparando a conexão",
    starting: "Iniciando",
    disconnected: "Desconectado; tentando novamente",
    logged_out: "Sessão encerrada; conecte novamente",
    resetting: "Criando uma nova sessão",
    error: "Serviço com erro",
    not_configured: "Serviço ainda não configurado",
  };
  return labels[state] || state;
}

export function WhatsappConnect() {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [phone, setPhone] = useState("55");
  const [pairingCode, setPairingCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const payload = await readJson<WhatsappStatus>(await fetch("/api/whatsapp/status", { cache: "no-store" }));
      setStatus(payload);
      if (payload.connected) {
        setQrDataUrl("");
        setPairingCode("");
        setError("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao verificar o WhatsApp.");
    }
  }, []);

  useEffect(() => {
    // Sincroniza o estado remoto ao abrir a tela e mantém uma assinatura por polling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 8000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const loadQr = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = await readJson<{ dataUrl: string }>(await fetch("/api/whatsapp/qr", { cache: "no-store" }));
      setQrDataUrl(payload.dataUrl);
      setPairingCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "O QR Code ainda não está pronto.");
    } finally {
      setBusy(false);
    }
  };

  const requestPairingCode = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = await readJson<{ code: string }>(
        await fetch("/api/whatsapp/pairing-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        }),
      );
      setPairingCode(payload.code);
      setQrDataUrl("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível gerar o código.");
    } finally {
      setBusy(false);
    }
  };

  const resetSession = async () => {
    setBusy(true);
    setError("");
    try {
      await readJson(
        await fetch("/api/whatsapp/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: resetConfirmation }),
        }),
      );
      setResetConfirmation("");
      setQrDataUrl("");
      setPairingCode("");
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível desconectar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d7658]">Canal de avisos</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Conectar WhatsApp</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">A conexão é feita nesta tela. O QR Code e o código de pareamento nunca ficam expostos no terminal.</p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} aria-label="Fechar aviso" className="text-xs font-bold">Fechar</button>
        </div>
      )}

      {!status ? (
        <section className="grid min-h-64 place-items-center rounded-3xl border border-slate-200 bg-white"><LoaderCircle className="h-8 w-8 animate-spin text-[#0d7658]" /></section>
      ) : !status.configured ? (
        <section className="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
          <div className="bg-amber-50 p-6 sm:p-8">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Cloud className="h-7 w-7" /></span>
            <h2 className="mt-5 text-2xl font-bold text-amber-950">Ative o serviço de conexão</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">O portal web está pronto, mas o WhatsApp precisa de um pequeno serviço Node.js sempre ligado para conservar a sessão.</p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
            {[
              ["1", "Publique a pasta", "Use a pasta whatsapp-service em um host Node com armazenamento persistente."],
              ["2", "Crie o segredo", "Defina WHATSAPP_SERVICE_TOKEN com pelo menos 32 caracteres nos dois serviços."],
              ["3", "Informe a URL", "Configure WHATSAPP_SERVICE_URL no portal e volte para gerar o QR Code."],
            ].map(([number, title, text]) => (
              <article key={number} className="rounded-2xl bg-slate-50 p-4">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0d7658] text-xs font-bold text-white">{number}</span>
                <h3 className="mt-4 text-sm font-bold">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
              </article>
            ))}
          </div>
        </section>
      ) : status.connected ? (
        <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white text-center shadow-sm">
          <div className="soft-grid bg-emerald-50 px-6 py-10">
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#0d7658] text-white shadow-xl shadow-emerald-950/20"><CheckCircle2 className="h-10 w-10" /></span>
            <h2 className="mt-5 text-2xl font-bold">WhatsApp conectado</h2>
            <p className="mt-2 text-sm text-emerald-800">As novas encomendas serão enviadas com texto, foto e código de retirada.</p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left">
              <Wifi className="h-5 w-5 shrink-0 text-[#0d7658]" />
              <div><strong className="block text-sm">Sessão ativa</strong><span className="text-xs text-slate-500">{stateLabel(status.state)}</span></div>
            </div>
            <div className="mx-auto mt-8 max-w-md rounded-2xl border border-red-100 bg-red-50 p-4 text-left">
              <h3 className="flex items-center gap-2 text-sm font-bold text-red-900"><Unplug className="h-4 w-4" /> Trocar o número conectado</h3>
              <p className="mt-2 text-xs leading-5 text-red-700">Isso encerra a sessão atual e exige uma nova conexão.</p>
              <input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value.toUpperCase())} placeholder="Digite DESCONECTAR" className="mt-3 h-11 w-full rounded-xl border border-red-200 bg-white px-3 text-sm" />
              <button onClick={() => void resetSession()} disabled={busy || resetConfirmation !== "DESCONECTAR"} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-700 text-xs font-bold text-white disabled:opacity-40">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Desconectar sessão</button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><RefreshCw className={`h-5 w-5 ${["starting", "connecting", "resetting"].includes(status.state) ? "animate-spin" : ""}`} /></span>
              <div><strong className="block text-sm">{stateLabel(status.state)}</strong><span className="text-xs text-slate-500">O estado é atualizado automaticamente.</span></div>
            </div>
            <button onClick={() => void loadStatus()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600"><RefreshCw className="h-4 w-4" /> Atualizar</button>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-[#0d7658]"><QrCode className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-wide text-[#0d7658]">Com outro aparelho</p><h2 className="text-lg font-bold">Ler QR Code</h2></div></div>
              <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
                <li><strong>1.</strong> No celular com o WhatsApp, abra Configurações.</li>
                <li><strong>2.</strong> Toque em Aparelhos conectados e Conectar aparelho.</li>
                <li><strong>3.</strong> Aponte a câmera para o código desta tela.</li>
              </ol>
              {qrDataUrl ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR Code para conectar o WhatsApp" className="mx-auto w-full max-w-72" />
                  <button onClick={() => void loadQr()} disabled={busy} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#0d7658]"><RefreshCw className="h-4 w-4" /> Gerar código atualizado</button>
                </div>
              ) : (
                <button onClick={() => void loadQr()} disabled={busy} className="mt-6 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#0d7658] font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />} Mostrar QR Code</button>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><Smartphone className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">No mesmo celular</p><h2 className="text-lg font-bold">Usar código de pareamento</h2></div></div>
              <p className="mt-5 text-sm leading-6 text-slate-600">Se esta plataforma está aberta no próprio telefone do WhatsApp, gere um código de oito dígitos em vez de tentar escanear a mesma tela.</p>
              <label className="mt-5 block text-xs font-bold text-slate-600">Número com DDI e DDD
                <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 15))} inputMode="tel" placeholder="5541999998888" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" />
              </label>
              {pairingCode ? (
                <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Código temporário</p>
                  <strong className="mt-2 block font-mono text-3xl tracking-[0.16em] text-blue-950">{pairingCode}</strong>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(pairingCode.replace(/-/g, ""));
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1600);
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-blue-700 shadow-sm"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />} {copied ? "Copiado" : "Copiar código"}
                  </button>
                  <p className="mt-4 text-xs leading-5 text-blue-800">No WhatsApp, vá a Aparelhos conectados, escolha conectar com número de telefone e informe este código.</p>
                </div>
              ) : (
                <button onClick={() => void requestPairingCode()} disabled={busy || phone.length < 12} className="mt-5 inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 font-bold text-white disabled:opacity-40">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />} Gerar código de 8 dígitos</button>
              )}
            </section>
          </div>

          <section className="flex items-start gap-3 rounded-2xl bg-[#102c24] p-5 text-emerald-50">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#f3b93f]" />
            <div><strong className="text-sm">Conexão restrita ao administrador</strong><p className="mt-1 text-xs leading-5 text-emerald-50/70">Porteiros e moradores não veem o QR Code nem podem trocar a sessão. Mantenha o celular principal protegido por senha.</p></div>
          </section>
        </>
      )}
    </div>
  );
}
