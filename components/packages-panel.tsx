"use client";

import {
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImageIcon,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ActorRole, PackageRecord, Pagination } from "../lib/types";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function notificationLabel(status: PackageRecord["notificationStatus"]) {
  if (status === "sent") return "WhatsApp enviado";
  if (status === "delivered") return "WhatsApp entregue";
  if (status === "read") return "WhatsApp visualizado";
  if (status === "failed") return "Falha no WhatsApp";
  if (status === "not_configured") return "WhatsApp não conectado";
  if (status === "consent_required") return "Aguardando autorização";
  return "Aviso pendente";
}

function notificationSucceeded(status: PackageRecord["notificationStatus"]) {
  return ["sent", "delivered", "read"].includes(status);
}

export function PackagesPanel({
  actorRole,
  packages,
  onChanged,
}: {
  actorRole: ActorRole;
  packages: PackageRecord[];
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "waiting" | "withdrawn">("waiting");
  const [selected, setSelected] = useState<PackageRecord | null>(null);
  const [pickupCode, setPickupCode] = useState("");
  const [withdrawnBy, setWithdrawnBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState(packages);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    total: packages.length,
    totalPages: 1,
  });
  const [listLoading, setListLoading] = useState(false);

  const loadPackages = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "50",
        status: filter,
      });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/encomendas?${params}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        packages?: PackageRecord[];
        pagination?: Pagination;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível carregar as encomendas.");
      }
      setRecords(payload.packages ?? []);
      if (payload.pagination) setPagination(payload.pagination);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao carregar a lista.",
      );
    } finally {
      setListLoading(false);
    }
  }, [filter, page, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPackages(), 300);
    return () => window.clearTimeout(timer);
  }, [loadPackages]);

  const close = () => {
    setSelected(null);
    setPickupCode("");
    setWithdrawnBy("");
    setError("");
  };

  const confirmWithdrawal = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/encomendas/${selected.id}/retirada`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupCode, withdrawnBy }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível confirmar a retirada.");
      close();
      await onChanged();
      await loadPackages();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao confirmar a retirada.");
    } finally {
      setBusy(false);
    }
  };

  const packageAction = async (
    action: "reenviar" | "desbloquear" | "excluir",
  ) => {
    if (!selected) return;
    if (
      action === "excluir" &&
      !window.confirm(
        "Excluir definitivamente esta encomenda e sua foto? Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        action === "excluir"
          ? `/api/encomendas/${selected.id}`
          : `/api/encomendas/${selected.id}/${action}`,
        { method: action === "excluir" ? "DELETE" : "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível concluir a ação.");
      }
      close();
      await onChanged();
      await loadPackages();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d7658]">Controle de volumes</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {actorRole === "resident" ? "Minhas encomendas" : "Encomendas"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {actorRole === "resident"
            ? "Consulte a foto, o status e o código que deve ser apresentado na portaria."
            : "Confira o histórico e valide a retirada com o código recebido pelo morador."}
        </p>
      </div>

      {error && !selected && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="text-xs font-bold">Fechar</button>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative block flex-1 md:max-w-lg">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar morador, unidade ou rastreio"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-emerald-400 focus:bg-white"
            />
          </label>
          <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 text-xs font-bold">
            {([
              ["waiting", "Aguardando"],
              ["withdrawn", "Retiradas"],
              ["all", "Todas"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-2.5 ${filter === value ? "bg-white text-[#0d7658] shadow-sm" : "text-slate-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {records.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex gap-4 p-4 sm:p-5">
                <button
                  onClick={() => setSelected(item)}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 sm:h-28 sm:w-28"
                  aria-label="Ver foto e detalhes"
                >
                  {item.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photoUrl} alt="Foto da encomenda" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="m-auto h-7 w-7 text-slate-300" />
                  )}
                  <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/65 text-white">
                    <ImageIcon className="h-3.5 w-3.5" />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-base">{item.residentName}</strong>
                      <span className="mt-0.5 block truncate text-sm font-semibold text-[#0d7658]">{item.unit}</span>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === "waiting" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {item.status === "waiting" ? "Aguardando" : "Retirada"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-xs text-slate-500">{item.description || "Encomenda sem descrição"}</p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                    <Clock3 className="h-3.5 w-3.5" /> {formatDate(item.receivedAt)}
                  </div>
                  <div className={`mt-2 flex items-center gap-2 text-[11px] font-semibold ${notificationSucceeded(item.notificationStatus) ? "text-emerald-700" : "text-amber-700"}`}>
                    {notificationSucceeded(item.notificationStatus) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {notificationLabel(item.notificationStatus)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
                {actorRole === "resident" && item.status === "waiting" ? (
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Código de retirada</span>
                    <strong className="font-mono text-lg tracking-[0.18em] text-[#0d7658]">{item.pickupCode}</strong>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Recebida por {item.registeredBy}</span>
                )}
                <button onClick={() => setSelected(item)} className="rounded-lg px-3 py-2 text-xs font-bold text-[#0d7658] hover:bg-emerald-50">
                  Ver detalhes
                </button>
              </div>
            </article>
          ))}
        </div>

        {records.length === 0 && !listLoading && (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <Box className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">Nenhuma encomenda encontrada</p>
              <p className="mt-1 text-xs text-slate-400">Altere a busca ou o filtro acima.</p>
            </div>
          </div>
        )}
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">
            {pagination.total} registro(s) · página {pagination.page} de {pagination.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || listLoading}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
              disabled={page >= pagination.totalPages || listLoading}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 disabled:opacity-40"
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <section className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#0d7658]">Encomenda #{selected.id}</p>
                <h2 className="mt-1 text-lg font-bold">{selected.residentName} · {selected.unit}</h2>
              </div>
              <button onClick={close} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              {selected.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.photoUrl} alt="Foto registrada da encomenda" className="max-h-[420px] w-full rounded-2xl bg-slate-100 object-contain" />
              ) : (
                <div className="grid h-48 place-items-center rounded-2xl bg-slate-100 text-sm text-slate-500">Foto removida pela política de retenção.</div>
              )}

              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs text-slate-400">Recebimento</dt>
                  <dd className="mt-1 font-semibold">{formatDate(selected.receivedAt)}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs text-slate-400">Status do aviso</dt>
                  <dd className="mt-1 font-semibold">{notificationLabel(selected.notificationStatus)}</dd>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs text-slate-400">Descrição / rastreio</dt>
                  <dd className="mt-1 font-semibold">{selected.description || "Sem descrição"}{selected.trackingCode ? ` · ${selected.trackingCode}` : ""}</dd>
                </div>
              </dl>

              {selected.status === "withdrawn" && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                  <PackageCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>Retirada por <strong>{selected.withdrawnBy}</strong> em {formatDate(selected.withdrawnAt)}.</span>
                </div>
              )}

              {actorRole === "resident" && selected.status === "waiting" && (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <ShieldCheck className="mx-auto h-6 w-6 text-[#0d7658]" />
                  <p className="mt-2 text-xs font-bold uppercase tracking-wider text-emerald-700">Apresente este código na portaria</p>
                  <strong className="mt-2 block font-mono text-4xl tracking-[0.25em] text-[#0d7658]">{selected.pickupCode}</strong>
                </div>
              )}

              {actorRole !== "resident" && selected.status === "waiting" && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-amber-700" />
                    <h3 className="font-bold text-amber-950">Confirmar retirada</h3>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-amber-800">Peça ao morador o código enviado pelo WhatsApp. Após cinco tentativas erradas, a validação é bloqueada.</p>
                  {error && <p className="mt-3 rounded-xl bg-red-100 p-3 text-xs font-semibold text-red-800">{error}</p>}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-amber-950">
                      Código de 6 dígitos
                      <input
                        value={pickupCode}
                        onChange={(event) => setPickupCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        className="mt-2 h-12 w-full rounded-xl border border-amber-200 bg-white px-4 font-mono text-lg tracking-[0.2em] outline-none focus:border-amber-500"
                      />
                    </label>
                    <label className="text-xs font-bold text-amber-950">
                      Quem está retirando
                      <input
                        value={withdrawnBy}
                        onChange={(event) => setWithdrawnBy(event.target.value)}
                        placeholder="Nome completo"
                        maxLength={160}
                        className="mt-2 h-12 w-full rounded-xl border border-amber-200 bg-white px-4 text-sm outline-none focus:border-amber-500"
                      />
                    </label>
                  </div>
                  <button
                    onClick={() => void confirmWithdrawal()}
                    disabled={busy || pickupCode.length !== 6 || !withdrawnBy.trim()}
                    className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d7658] font-bold text-white disabled:opacity-40"
                  >
                    {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}
                    Confirmar retirada
                  </button>
                </div>
              )}

              {actorRole !== "resident" && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => void packageAction("reenviar")}
                    disabled={busy || selected.status !== "waiting" || !selected.photoUrl}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-800 disabled:opacity-40"
                  >
                    <RefreshCw className="h-4 w-4" /> Reenviar aviso
                  </button>
                  {actorRole === "admin" && selected.failedPickupAttempts >= 5 && (
                    <button
                      onClick={() => void packageAction("desbloquear")}
                      disabled={busy}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-amber-800 disabled:opacity-40"
                    >
                      <RotateCcw className="h-4 w-4" /> Desbloquear retirada
                    </button>
                  )}
                  {actorRole === "admin" && (
                    <button
                      onClick={() => void packageAction("excluir")}
                      disabled={busy}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-red-800 disabled:opacity-40 sm:col-span-2"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir encomenda e foto
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
