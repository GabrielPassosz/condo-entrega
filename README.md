# CondoEntrega

SaaS responsivo para recebimento e retirada de encomendas em condomínios. A
portaria fotografa a etiqueta, o navegador executa OCR, um operador confirma o
morador e o sistema registra a encomenda antes de avisá-lo pela WhatsApp
Business Platform oficial.

## O que está implementado

- Multi-tenancy real: perfis, moradores, encomendas, configurações e auditoria
  são isolados por condomínio; um usuário pode alternar entre seus ambientes.
- Bootstrap seguro: somente e-mails em `INITIAL_ADMIN_EMAILS` podem criar a
  primeira instalação, e apenas enquanto o banco estiver vazio.
- Confirmação humana obrigatória: qualquer alteração ou nova busca da etiqueta
  limpa a seleção anterior do morador.
- Registro resiliente: foto determinística no R2, idempotência, transação D1
  para encomenda + outbox, timeout e reenvio de notificações.
- Retirada protegida: código de seis dígitos cifrado com AES-GCM, validação por
  HMAC, incremento concorrente das tentativas e desbloqueio administrativo.
- LGPD por construção: o texto bruto do OCR não é salvo; fotos expiram; códigos
  são apagados após retirada; moradores podem ser desativados, excluídos ou
  anonimizados; consentimento de WhatsApp é registrado.
- Operação administrativa: edição e desativação de moradores e acessos,
  importação em lotes, listagens paginadas, reenvio, exclusão e auditoria.
- WhatsApp oficial: envio de modelo aprovado com foto pela Meta Cloud API,
  webhook assinado e acompanhamento de `sent`, `delivered`, `read` e `failed`.

## Fluxo de consistência

1. O cliente cria uma chave idempotente e envia foto + morador confirmado.
2. O R2 recebe a foto em uma chave determinística.
3. Uma única transação D1 cria a encomenda e o job da outbox.
4. A fila (ou o processador síncrono de contingência) chama a Meta com timeout.
5. O resultado e o log são atualizados em lote; falhas entram em backoff e
   também podem ser reenviadas manualmente.

## Tecnologia

- Next.js/Vinext em Cloudflare Workers.
- Cloudflare D1 com Drizzle ORM.
- Cloudflare R2 para fotos privadas.
- Cloudflare Queues opcional, com outbox D1 durável como fonte de verdade.
- Tesseract.js e Barcode Detection API no navegador.
- Sign in with ChatGPT com vínculo pelo identificador estável do usuário.

## Desenvolvimento

Requer Node.js 22.13 ou superior.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run dev
```

As migrações são imutáveis e devem ser aplicadas em ordem:

- `drizzle/0000_fancy_sumo.sql`
- `drizzle/0001_condemned_maelstrom.sql`
- `drizzle/0002_watery_stark_industries.sql`

Não execute `db:generate` durante o deploy; ele serve para criar uma nova
migração durante o desenvolvimento.

## Configuração e operação

Copie os nomes de configuração de `.env.example`. Antes de tornar a URL
pública, configure obrigatoriamente `INITIAL_ADMIN_EMAILS` e
`PICKUP_CODE_SECRET`.

- [Publicação e WhatsApp oficial](DEPLOY.md)
- [Backups, restauração e política de dados](docs/OPERATIONS.md)
- [Modelo de planilha de moradores](docs/moradores_modelo.xlsx)

Na planilha, `Nome`, `Telefone` e `Unidade` (ou `Bloco` + `Apartamento`) são
obrigatórios. `Email`, `Autorizados`, `Observacoes` e
`Consentimento WhatsApp` são opcionais. A importação valida até 2.000 linhas e
grava em lotes D1.

## Serviço Baileys legado

`whatsapp-service/` permanece somente para uma migração controlada. Ele não é
ativado automaticamente: exige `WHATSAPP_PROVIDER=baileys` e
`ALLOW_LEGACY_BAILEYS=true`. Novas instalações devem usar a Cloud API oficial.
