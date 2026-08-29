import type { Metadata } from "next";
import "./globals.css";

function configuredOrigin() {
  const raw =
    process.env.SITE_ORIGIN?.trim() ||
    "https://condo-entrega.gabriellbpassos.chatgpt.site";
  if (!raw) return undefined;
  try {
    const value = new URL(raw);
    if (value.protocol !== "https:" || value.username || value.password) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

const metadataBase = configuredOrigin();
const socialImage = metadataBase
  ? new URL("/og.png", metadataBase).toString()
  : "/og.png";

export const metadata: Metadata = {
  metadataBase,
  title: "CondoEntrega — Encomendas sem papelada",
  description:
    "Receba, identifique e avise moradores sobre encomendas diretamente pelo celular.",
  openGraph: {
    title: "CondoEntrega",
    description: "A portaria digital que identifica a etiqueta e avisa o morador.",
    type: "website",
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "CondoEntrega — encomendas identificadas e avisadas em poucos segundos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CondoEntrega",
    description: "Encomendas identificadas e avisadas em poucos segundos.",
    images: [socialImage],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
