"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  KeyRound,
  LoaderCircle,
  Mail,
  Plus,
  Search,
  Shield,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import readXlsxFile from "read-excel-file/browser";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AccessProfile, ActorRole, Resident } from "../lib/types";

type View = "residents" | "access";

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
}

const headerAliases: Record<string, string> = {
  unidade: "unidade",
  unit: "unidade",
  bloco: "bloco",
  block: "bloco",
  apartamento: "apartamento",
  apto: "apartamento",
  ap: "apartamento",
  nome: "nome",
  morador: "nome",
  residente: "nome",
  telefone: "telefone",
  celular: "telefone",
  whatsapp: "telefone",
  email: "email",
  autorizados: "autorizados",
  pessoasautorizadas: "autorizados",
  observacoes: "observacoes",
  observacao: "observacoes",
  notas: "observacoes",
};

function roleName(role: ActorRole) {
  if (role === "admin") return "Administrador";
  if (role === "porter") return "Portaria";
  return "Morador";
}

async function jsonResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}

export function ResidentsPanel({
  actorRole,
  residents,
  onChanged,
}: {
  actorRole: ActorRole;
  residents: Resident[];
  onChanged: () => Promise<void>;
}) {
  const isAdmin = actorRole === "admin";
  const [view, setView] = useState<View>("residents");
  const [query, setQuery] = useState("");
  const [showResidentForm, setShowResidentForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const spreadsheetRef = useRef<HTMLInputElement>(null);
  const [residentForm, setResidentForm] = useState({
    block: "",
    apartment: "",
    unit: "",
    name: "",
    phone: "55",
    email: "",
    authorizedPeople: "",
    notes: "",
  });
  const [accessForm, setAccessForm] = useState<{
    displayName: string;
    email: string;
    role: ActorRole;
    residentId: string;
  }>({ displayName: "", email: "", role: "porter", residentId: "" });

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return residents;
    return residents.filter((resident) =>
      [resident.name, resident.unit, resident.phone, resident.email]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
    );
  }, [query, residents]);

  const loadProfiles = async () => {
    if (!isAdmin) return;
    setProfileLoading(true);
    setError("");
    try {
      const payload = await jsonResponse<{ profiles: AccessProfile[] }>(await fetch("/api/perfis"));
      setProfiles(payload.profiles);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar acessos.");
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    // A consulta só existe quando o administrador abre esta área.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (view === "access" && isAdmin && profiles.length === 0) void loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isAdmin]);

  const saveResident = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await jsonResponse(
        await fetch("/api/moradores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(residentForm),
        }),
      );
      setShowResidentForm(false);
      setResidentForm({ block: "", apartment: "", unit: "", name: "", phone: "55", email: "", authorizedPeople: "", notes: "" });
      setMessage("Morador salvo com sucesso.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar morador.");
    } finally {
      setBusy(false);
    }
  };

  const importSpreadsheet = async (file: File) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const workbook = await readXlsxFile(file);
      const table = workbook[0]?.data ?? [];
      if (table.length < 2) throw new Error("A planilha está vazia.");
      const headers = table[0].map((cell) => headerAliases[normalizeHeader(cell)] || "");
      if (!headers.includes("nome") || !headers.includes("telefone")) {
        throw new Error("A primeira linha precisa conter pelo menos Nome e Telefone.");
      }
      const rows = table
        .slice(1)
        .filter((row) => row.some((cell) => String(cell ?? "").trim()))
        .map((row) => {
          const record: Record<string, unknown> = {};
          headers.forEach((header, index) => {
            if (header) record[header] = row[index] ?? "";
          });
          return record;
        });
      const payload = await jsonResponse<{ imported: number; errors: string[] }>(
        await fetch("/api/moradores/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        }),
      );
      setMessage(`${payload.imported} morador(es) importado(s).${payload.errors.length ? ` ${payload.errors.length} linha(s) precisam de correção.` : ""}`);
      if (payload.errors.length) setError(payload.errors.slice(0, 4).join(" "));
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível importar a planilha.");
    } finally {
      setBusy(false);
      if (spreadsheetRef.current) spreadsheetRef.current.value = "";
    }
  };

  const saveAccess = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await jsonResponse(
        await fetch("/api/perfis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...accessForm,
            residentId: accessForm.role === "resident" ? Number(accessForm.residentId) : null,
          }),
        }),
      );
      setAccessForm({ displayName: "", email: "", role: "porter", residentId: "" });
      setMessage("Acesso vinculado. O usuário deve entrar com exatamente esse e-mail.");
      await loadProfiles();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar acesso.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d7658]">Cadastros do condomínio</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Moradores e acessos</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">A correspondência da etiqueta usa nome, unidade, bloco e apartamento deste cadastro.</p>
        </div>
        {isAdmin && view === "residents" && (
          <button onClick={() => setShowResidentForm(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0d7658] px-5 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> Novo morador
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="inline-grid grid-cols-2 rounded-xl bg-slate-200/70 p-1 text-sm font-bold">
          <button onClick={() => setView("residents")} className={`rounded-lg px-4 py-2.5 ${view === "residents" ? "bg-white text-[#0d7658] shadow-sm" : "text-slate-500"}`}>
            Moradores
          </button>
          <button onClick={() => setView("access")} className={`rounded-lg px-4 py-2.5 ${view === "access" ? "bg-white text-[#0d7658] shadow-sm" : "text-slate-500"}`}>
            Acessos
          </button>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {message}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> {error}
        </div>
      )}

      {view === "residents" && (
        <>
          {isAdmin && (
            <section className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><FileSpreadsheet className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-sm font-bold text-blue-950">Importar lista de moradores</h2>
                  <p className="mt-1 text-xs leading-5 text-blue-800">Use uma planilha .xlsx com Nome, Telefone e Unidade ou Bloco/Apartamento.</p>
                </div>
              </div>
              <input
                ref={spreadsheetRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importSpreadsheet(file);
                }}
              />
              <button onClick={() => spreadsheetRef.current?.click()} disabled={busy} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Selecionar planilha
              </button>
            </section>
          )}

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <label className="relative block max-w-xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, unidade, telefone ou e-mail" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
            </label>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((resident) => (
                <article key={resident.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 font-bold text-[#0d7658]">{resident.unit.slice(0, 3)}</span>
                    <div className="min-w-0">
                      <strong className="block truncate text-sm">{resident.name}</strong>
                      <span className="mt-1 block text-xs font-semibold text-[#0d7658]">{resident.unit}</span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <p>{resident.phone}</p>
                    <p className="truncate">{resident.email || "Sem e-mail de acesso"}</p>
                    {resident.authorizedPeople && <p className="line-clamp-1">Autorizados: {resident.authorizedPeople}</p>}
                  </div>
                </article>
              ))}
            </div>
            {visible.length === 0 && (
              <div className="grid min-h-52 place-items-center text-center">
                <div><UsersRound className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">Nenhum morador encontrado</p></div>
              </div>
            )}
          </section>
        </>
      )}

      {view === "access" && isAdmin && (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-[#0d7658]" /><h2 className="text-lg font-bold">Liberar novo acesso</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Cadastre o e-mail exato que o porteiro ou morador usa ao entrar na plataforma.</p>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-slate-600">Nome de exibição
                <input value={accessForm.displayName} onChange={(event) => setAccessForm((current) => ({ ...current, displayName: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" placeholder="Ex.: Portaria da manhã" />
              </label>
              <label className="block text-xs font-bold text-slate-600">E-mail de entrada
                <input type="email" value={accessForm.email} onChange={(event) => setAccessForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" placeholder="usuario@exemplo.com" />
              </label>
              <label className="block text-xs font-bold text-slate-600">Tipo de acesso
                <select value={accessForm.role} onChange={(event) => setAccessForm((current) => ({ ...current, role: event.target.value as ActorRole, residentId: "" }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
                  <option value="porter">Portaria — recebe e entrega</option>
                  <option value="resident">Morador — vê somente as próprias</option>
                  <option value="admin">Administrador — acesso completo</option>
                </select>
              </label>
              {accessForm.role === "resident" && (
                <label className="block text-xs font-bold text-slate-600">Vincular ao morador
                  <select value={accessForm.residentId} onChange={(event) => setAccessForm((current) => ({ ...current, residentId: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
                    <option value="">Selecione</option>
                    {residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.unit} — {resident.name}</option>)}
                  </select>
                </label>
              )}
              <button onClick={() => void saveAccess()} disabled={busy || !accessForm.displayName.trim() || !accessForm.email.includes("@") || (accessForm.role === "resident" && !accessForm.residentId)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d7658] font-bold text-white disabled:opacity-40">
                {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Shield className="h-5 w-5" />} Salvar acesso
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-[#0d7658]">Permissões</p><h2 className="mt-1 text-lg font-bold">Usuários vinculados</h2></div><button onClick={() => void loadProfiles()} className="text-xs font-bold text-[#0d7658]">Atualizar</button></div>
            {profileLoading ? (
              <div className="grid min-h-56 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-[#0d7658]" /></div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {profiles.map((profile) => (
                  <article key={profile.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${profile.role === "admin" ? "bg-violet-50 text-violet-700" : profile.role === "porter" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {profile.role === "resident" ? <UserRound className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{profile.displayName}</strong><span className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><Mail className="h-3 w-3" /> {profile.email}</span></div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{roleName(profile.role)}</span>
                  </article>
                ))}
                {profiles.length === 0 && <p className="py-12 text-center text-sm text-slate-500">Nenhum acesso carregado.</p>}
              </div>
            )}
          </section>
        </div>
      )}

      {showResidentForm && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-5">
          <section className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-[#0d7658]">Cadastro individual</p><h2 className="mt-1 text-xl font-bold">Novo morador</h2></div><button onClick={() => { setShowResidentForm(false); setError(""); }} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button></div>
            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Nome completo<input value={residentForm.name} onChange={(event) => setResidentForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-600">Bloco<input value={residentForm.block} onChange={(event) => setResidentForm((current) => ({ ...current, block: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" placeholder="Ex.: B" /></label>
              <label className="text-xs font-bold text-slate-600">Apartamento / casa<input value={residentForm.apartment} onChange={(event) => setResidentForm((current) => ({ ...current, apartment: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" placeholder="Ex.: 304" /></label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Unidade pronta (opcional)<input value={residentForm.unit} onChange={(event) => setResidentForm((current) => ({ ...current, unit: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" placeholder="Ex.: Torre 2, apto 304" /></label>
              <label className="text-xs font-bold text-slate-600">WhatsApp com DDI<input inputMode="tel" value={residentForm.phone} onChange={(event) => setResidentForm((current) => ({ ...current, phone: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" placeholder="5541999998888" /></label>
              <label className="text-xs font-bold text-slate-600">E-mail (para acesso)<input type="email" value={residentForm.email} onChange={(event) => setResidentForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Pessoas autorizadas<input value={residentForm.authorizedPeople} onChange={(event) => setResidentForm((current) => ({ ...current, authorizedPeople: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-normal" /></label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Observações<textarea value={residentForm.notes} onChange={(event) => setResidentForm((current) => ({ ...current, notes: event.target.value }))} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-4 text-sm font-normal" /></label>
            </div>
            <button onClick={() => void saveResident()} disabled={busy} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d7658] font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />} Salvar morador</button>
          </section>
        </div>
      )}
    </div>
  );
}
