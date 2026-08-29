"use client";

import {
  BellRing,
  Box,
  Building2,
  Camera,
  ChevronRight,
  CircleUserRound,
  History,
  Home,
  LogOut,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Smartphone,
  UsersRound,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { chatGPTSignOutPath } from "../app/chatgpt-auth";
import type { BootstrapData, PackageRecord, Resident } from "../lib/types";
import { PackagesPanel } from "./packages-panel";
import { ReceivePackage } from "./receive-package";
import { ResidentsPanel } from "./residents-panel";
import { WhatsappConnect } from "./whatsapp-connect";

type Tab = "home" | "receive" | "packages" | "residents" | "whatsapp";

const roleLabels = {
  admin: "Administrador",
  porter: "Portaria",
  resident: "Morador",
};

async function readResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os dados.");
  return payload;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CondoApp({ identity }: { identity: { name: string; email: string } }) {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    setError("");
    try {
      const bootstrapData = await readResponse<BootstrapData>(await fetch("/api/bootstrap"));
      setBootstrap(bootstrapData);
      const [packageData, residentData] = await Promise.all([
        readResponse<{ packages: PackageRecord[] }>(await fetch("/api/encomendas")),
        readResponse<{ residents: Resident[] }>(await fetch("/api/moradores")),
      ]);
      setPackages(packageData.packages);
      setResidents(residentData.residents);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao abrir a plataforma.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carregamento inicial após a hidratação do painel protegido.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, [loadAll]);

  const waitingPackages = useMemo(
    () => packages.filter((item) => item.status === "waiting"),
    [packages],
  );

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7f5] px-6">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#0d7658] text-white shadow-xl shadow-emerald-900/15">
            <Box className="h-8 w-8 animate-pulse" />
          </div>
          <p className="mt-5 font-semibold text-[#244238]">Preparando a portaria…</p>
        </div>
      </main>
    );
  }

  if (!bootstrap || error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7f5] px-5">
        <section className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-7 text-center shadow-xl shadow-slate-900/5">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
            <CircleUserRound className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Acesso ainda não liberado</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>
          <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
            E-mail conectado: {identity.email}
          </p>
          <button
            onClick={() => {
              setLoading(true);
              void loadAll();
            }}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d7658] font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </section>
      </main>
    );
  }

  const canOperate = bootstrap.actor.role !== "resident";
  const isAdmin = bootstrap.actor.role === "admin";
  const navItems: { id: Tab; label: string; icon: typeof Home; visible: boolean }[] = [
    { id: "home", label: "Início", icon: Home, visible: true },
    { id: "receive", label: "Receber", icon: ScanLine, visible: canOperate },
    { id: "packages", label: bootstrap.actor.role === "resident" ? "Minhas" : "Encomendas", icon: History, visible: true },
    { id: "residents", label: "Moradores", icon: UsersRound, visible: canOperate },
    { id: "whatsapp", label: "WhatsApp", icon: Smartphone, visible: isAdmin },
  ];

  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#13251f]">
      <header className="sticky top-0 z-40 border-b border-emerald-950/5 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={() => openTab("home")} className="flex items-center gap-3 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0d7658] text-white shadow-lg shadow-emerald-950/15">
              <Box className="h-5 w-5" />
            </span>
            <span>
              <strong className="block text-[15px] leading-4">CondoEntrega</strong>
              <span className="text-xs text-[#6c7b75]">{bootstrap.condominium.name}</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
            {navItems.filter((item) => item.visible).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => openTab(item.id)}
                  className={`flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                    activeTab === item.id
                      ? "bg-emerald-50 text-[#0d7658]"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-44 truncate text-sm font-semibold">{bootstrap.actor.displayName}</p>
              <p className="text-xs text-[#6c7b75]">{roleLabels[bootstrap.actor.role]}</p>
            </div>
            <a
              href={chatGPTSignOutPath("/")}
              aria-label="Sair"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">
        {activeTab === "home" && (
          <div className="space-y-6">
            {isAdmin && !bootstrap.whatsappConfigured && (
              <button
                onClick={() => openTab("whatsapp")}
                className="flex w-full items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-amber-950"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <WifiOff className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">WhatsApp precisa ser conectado</strong>
                  <span className="block truncate text-xs text-amber-800">Abra a tela de conexão para ver o QR Code.</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0" />
              </button>
            )}

            <section className="soft-grid relative overflow-hidden rounded-[2rem] bg-[#0b5d47] px-6 py-8 text-white shadow-2xl shadow-emerald-950/15 sm:px-9 sm:py-10">
              <div className="relative z-10 max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-50">
                  <Building2 className="h-3.5 w-3.5" /> Portaria digital
                </span>
                <h1 className="mt-5 text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
                  {bootstrap.actor.role === "resident"
                    ? `Olá, ${bootstrap.actor.displayName.split(" ")[0]}.`
                    : "Uma foto. O morador certo. Aviso enviado."}
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-emerald-50/80 sm:text-base">
                  {bootstrap.actor.role === "resident"
                    ? "Acompanhe as encomendas que chegaram para sua unidade e consulte seu código de retirada."
                    : "Fotografe a etiqueta pelo celular. A plataforma lê os dados, localiza o cadastro e prepara o WhatsApp para confirmação."}
                </p>
                {canOperate && (
                  <button
                    onClick={() => openTab("receive")}
                    className="mt-7 inline-flex h-14 items-center gap-3 rounded-2xl bg-[#f3b93f] px-6 text-sm font-bold text-[#3c2b06] shadow-lg shadow-amber-950/20 transition hover:-translate-y-0.5 hover:bg-[#f7c75d]"
                  >
                    <Camera className="h-5 w-5" /> Receber nova encomenda
                  </button>
                )}
              </div>
              <div className="absolute -bottom-20 -right-16 h-72 w-72 rounded-full border-[48px] border-white/5" />
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Aguardando retirada", value: bootstrap.stats.waiting, icon: Box, color: "text-amber-700 bg-amber-50" },
                { label: "Recebidas hoje", value: bootstrap.stats.receivedToday, icon: PackageCheck, color: "text-[#0d7658] bg-emerald-50" },
                { label: "Moradores ativos", value: bootstrap.stats.residents, icon: UsersRound, color: "text-blue-700 bg-blue-50" },
                { label: "Avisos com falha", value: bootstrap.stats.notificationFailures, icon: BellRing, color: "text-rose-700 bg-rose-50" },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <article key={stat.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${stat.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <strong className="mt-4 block text-2xl font-bold sm:text-3xl">{stat.value}</strong>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{stat.label}</span>
                  </article>
                );
              })}
            </section>

            <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d7658]">Agora na portaria</p>
                  <h2 className="mt-1 text-xl font-bold">Aguardando retirada</h2>
                </div>
                <button onClick={() => openTab("packages")} className="text-sm font-semibold text-[#0d7658]">Ver todas</button>
              </div>
              <div className="mt-5 divide-y divide-slate-100">
                {waitingPackages.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => openTab("packages")}
                    className="flex w-full items-center gap-4 py-4 text-left first:pt-0 last:pb-0"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#0d7658]">
                      <Box className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{item.residentName}</strong>
                      <span className="mt-1 block truncate text-xs text-slate-500">{item.unit} · {formatDate(item.receivedAt)}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-slate-300" />
                  </button>
                ))}
                {waitingPackages.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-500">Nenhuma encomenda aguardando retirada.</div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === "receive" && canOperate && (
          <ReceivePackage
            residents={residents}
            onRegistered={async () => {
              await loadAll();
            }}
          />
        )}
        {activeTab === "packages" && (
          <PackagesPanel
            actorRole={bootstrap.actor.role}
            packages={packages}
            onChanged={loadAll}
          />
        )}
        {activeTab === "residents" && canOperate && (
          <ResidentsPanel
            actorRole={bootstrap.actor.role}
            residents={residents}
            onChanged={loadAll}
          />
        )}
        {activeTab === "whatsapp" && isAdmin && <WhatsappConnect />}
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-2 pt-2 backdrop-blur-xl lg:hidden" aria-label="Navegação móvel">
        <div className="mx-auto flex max-w-lg items-start justify-around">
          {navItems.filter((item) => item.visible).map((item) => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => openTab(item.id)}
                className={`flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold ${selected ? "text-[#0d7658]" : "text-slate-400"}`}
              >
                <span className={`grid h-8 w-10 place-items-center rounded-xl ${selected ? "bg-emerald-50" : ""}`}>
                  <Icon className="h-5 w-5" />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
