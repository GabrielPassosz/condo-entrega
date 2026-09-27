"use client";

import { Building2, LoaderCircle, Plus, X } from "lucide-react";
import { useState } from "react";
import type { BootstrapData } from "../lib/types";

export function CondominiumSwitcher({
  bootstrap,
}: {
  bootstrap: BootstrapData;
}) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    timezone: "America/Sao_Paulo",
    photoRetentionDays: 90,
  });

  const select = async (condominiumId: number) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/condominios/selecionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condominiumId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível trocar o condomínio.");
      }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao trocar.");
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/condominios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível criar o condomínio.");
      }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <select
          value={bootstrap.condominium.id}
          onChange={(event) => void select(Number(event.target.value))}
          disabled={busy}
          aria-label="Condomínio ativo"
          className="h-9 max-w-40 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 sm:max-w-56"
        >
          {bootstrap.memberships.map((membership) => (
            <option
              key={membership.condominiumId}
              value={membership.condominiumId}
            >
              {membership.condominiumName}
            </option>
          ))}
        </select>
        {bootstrap.actor.role === "admin" && (
          <button
            onClick={() => setCreating(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-[#0d7658]"
            aria-label="Criar condomínio"
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <section className="w-full max-w-lg rounded-t-3xl bg-white p-6 text-left shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#0d7658]">
                  Ambiente separado
                </p>
                <h2 className="mt-1 text-xl font-bold">Novo condomínio</h2>
              </div>
              <button
                onClick={() => setCreating(false)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-bold text-slate-700">
                Nome
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-normal"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Fuso horário
                <input
                  value={form.timezone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-normal"
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Retenção das fotos em dias
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={form.photoRetentionDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      photoRetentionDays: Number(event.target.value),
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-normal"
                />
              </label>
            </div>
            <button
              onClick={() => void create()}
              disabled={busy || !form.name.trim()}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0d7658] font-bold text-white disabled:opacity-40"
            >
              {busy ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <Building2 className="h-5 w-5" />
              )}
              Criar e acessar
            </button>
          </section>
        </div>
      )}
    </>
  );
}
