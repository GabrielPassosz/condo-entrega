"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DatabaseBackup,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AuditRecord, BootstrapData, Pagination } from "../lib/types";

const actionLabels: Record<string, string> = {
  "condominium.created": "Condomínio criado",
  "condominium.updated": "Configurações alteradas",
  "resident.created_or_updated": "Morador cadastrado",
  "resident.updated": "Morador alterado",
  "resident.deactivate": "Morador desativado",
  "resident.anonymize": "Morador anonimizado",
  "resident.delete": "Morador excluído",
  "resident.imported": "Planilha importada",
  "profile.created_or_updated": "Acesso cadastrado",
  "profile.updated": "Acesso alterado",
  "profile.deleted": "Acesso excluído",
  "package.created": "Encomenda registrada",
  "package.withdrawn": "Encomenda retirada",
  "package.pickup_failed": "Código de retirada incorreto",
  "package.pickup_locked": "Retirada bloqueada",
  "package.pickup_unlocked": "Retirada desbloqueada",
  "package.notification_requeued": "Aviso reenviado",
  "package.deleted": "Encomenda excluída",
  "package.photo_retention_applied": "Foto eliminada por retenção",
  "retention.executed": "Retenção executada",
  "notification_queue.processed": "Fila de avisos processada",
  "whatsapp.legacy_pairing_requested": "Pareamento legado solicitado",
  "whatsapp.legacy_session_reset": "Sessão legada redefinida",
  "whatsapp.legacy_qr_viewed": "QR Code legado consultado",
};

async function readResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminPanel({
  bootstrap,
  onChanged,
}: {
  bootstrap: BootstrapData;
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: bootstrap.condominium.name,
    timezone: bootstrap.condominium.timezone,
    photoRetentionDays: String(bootstrap.condominium.photoRetentionDays),
  });
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [query, setQuery] = useState("");
  const [auditLoading, setAuditLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAudit = useCallback(async (page = 1, search = query) => {
    setAuditLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) params.set("q", search.trim());
      const payload = await readResponse<{ audit: AuditRecord[]; pagination: Pagination }>(
        await fetch(`/api/auditoria?${params}`),
      );
      setAudit(payload.audit);
      setPagination(payload.pagination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar auditoria.");
    } finally {
      setAuditLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // A trilha é carregada apenas quando o administrador abre esta tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAudit(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async () => {
    setBusyAction("settings");
    setError("");
    setMessage("");
    try {
      await readResponse(
        await fetch(`/api/condominios/${bootstrap.condominium.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            timezone: form.timezone,
            photoRetentionDays: Number(form.photoRetentionDays),
          }),
        }),
      );
      setMessage("Configurações salvas.");
      await onChanged();
      await loadAudit(1, query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar configurações.");
    } finally {
      setBusyAction("");
    }
  };

  const runAction = async (action: "retention" | "notifications") => {
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      if (action === "retention") {
        const result = await readResponse<{
          purged: number;
          errors: string[];
          legacyCodes: { protected: number; discarded: number; errors: string[] };
          orphanedPhotos: { purged: number; errors: string[] };
        }>(
          await fetch("/api/admin/retencao", { method: "POST" }),
        );
        setMessage(`${result.purged} foto(s) expirada(s) e ${result.orphanedPhotos.purged} upload(s) órfão(s) eliminados; ${result.legacyCodes.protected} código(s) legado(s) protegido(s).${result.errors.length || result.orphanedPhotos.errors.length || result.legacyCodes.errors.length ? " Algumas operações falharam." : ""}`);
      } else {
        const result = await readResponse<{ processed: number }>(
          await fetch("/api/admin/notificacoes", { method: "POST" }),
        );
        setMessage(`${result.processed} aviso(s) pendente(s) processado(s).`);
      }
      await onChanged();
      await loadAudit(1, query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao executar manutenção.");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d7658]">Administração</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Configurações e auditoria</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Controle retenção de dados, tarefas pendentes e alterações administrativas deste condomínio.</p>
      </div>

      {message && <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {message}</div>}
      {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> {error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[#0d7658]" /><h2 className="text-lg font-bold">Condomínio atual</h2></div>
          <div className="mt-5 space-y-4">
            <label className="block text-xs font-bold text-slate-600">Nome
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Fuso horário IANA
              <input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" placeholder="America/Sao_Paulo" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Retenção das fotos (dias)
              <input type="number" min="1" max="3650" value={form.photoRetentionDays} onChange={(event) => setForm((current) => ({ ...current, photoRetentionDays: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" />
              <span className="mt-2 block font-normal leading-5 text-slate-500">Após esse prazo, a foto e o texto bruto da etiqueta são eliminados automaticamente. O registro operacional permanece.</span>
            </label>
            <button onClick={() => void saveSettings()} disabled={Boolean(busyAction) || !form.name.trim()} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d7658] font-bold text-white disabled:opacity-40">
              {busyAction === "settings" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Salvar configurações
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><DatabaseBackup className="h-5 w-5 text-[#0d7658]" /><h2 className="text-lg font-bold">Manutenção segura</h2></div>
          <div className="mt-5 space-y-3">
            <button onClick={() => void runAction("notifications")} disabled={Boolean(busyAction)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left disabled:opacity-40">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">{busyAction === "notifications" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}</span>
              <span><strong className="block text-sm">Processar avisos pendentes</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Executa agora a fila durável e as tentativas de reenvio vencidas.</span></span>
            </button>
            <button onClick={() => void runAction("retention")} disabled={Boolean(busyAction)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left disabled:opacity-40">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-700">{busyAction === "retention" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}</span>
              <span><strong className="block text-sm">Aplicar retenção agora</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Remove fotos vencidas, uploads órfãos e protege códigos legados.</span></span>
            </button>
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            <strong className="text-slate-800">Backups</strong>
            <p className="mt-1">O procedimento de backup e restauração do D1/R2 está documentado no guia de operação do projeto. Backups seguem a mesma proteção de acesso e prazo de retenção.</p>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-wide text-[#0d7658]">Rastreabilidade</p><h2 className="mt-1 text-lg font-bold">Auditoria administrativa</h2></div>
          <form onSubmit={(event) => { event.preventDefault(); void loadAudit(1); }} className="flex gap-2">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ação, usuário ou registro" className="h-10 w-64 max-w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs" />
            </label>
            <button className="h-10 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700">Buscar</button>
          </form>
        </div>

        {auditLoading ? (
          <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-[#0d7658]" /></div>
        ) : (
          <div className="mt-5 divide-y divide-slate-100">
            {audit.map((record) => (
              <article key={record.id} className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Clock3 className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-sm">{actionLabels[record.action] || record.action}</strong>
                  <span className="mt-1 block truncate text-xs text-slate-500">{record.actorEmail} · {record.entityType} #{record.entityId}</span>
                </div>
                <time className="text-xs text-slate-500">{formatDate(record.createdAt)}</time>
              </article>
            ))}
            {audit.length === 0 && <p className="py-12 text-center text-sm text-slate-500">Nenhum evento encontrado.</p>}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span>{pagination.total} evento(s)</span>
          <div className="flex items-center gap-2">
            <button onClick={() => void loadAudit(pagination.page - 1)} disabled={auditLoading || pagination.page <= 1} aria-label="Página anterior" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span>Página {pagination.page} de {pagination.totalPages}</span>
            <button onClick={() => void loadAudit(pagination.page + 1)} disabled={auditLoading || pagination.page >= pagination.totalPages} aria-label="Próxima página" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
