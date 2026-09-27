# Publicação segura do CondoEntrega

## 1. Proteja o primeiro acesso

Configure os segredos **antes** de publicar a URL:

```text
INITIAL_ADMIN_EMAILS=responsavel@empresa.com
PICKUP_CODE_SECRET=<64 caracteres hexadecimais aleatórios>
CONDOMINIUM_NAME=Residencial Exemplo
SITE_ORIGIN=https://portal.exemplo.com
```

`INITIAL_ADMIN_EMAILS` aceita uma lista separada por vírgulas. A allowlist só
funciona quando o D1 ainda não possui condomínio; depois disso, todo acesso
precisa ser convidado pela tela **Moradores > Acessos**. Assim, uma visita
anônima à hospedagem não consegue assumir a administração.

Gere `PICKUP_CODE_SECRET` localmente e guarde-o no cofre da hospedagem:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Perder esse segredo impede a leitura dos códigos de encomendas ainda abertas.
Não o reutilize como token do WhatsApp.

## 2. Banco, objetos e migrações

Vincule o D1 como `DB` e o R2 privado como `BUCKET`. Faça um backup e aplique,
uma única vez e em ordem, todos os arquivos ainda não registrados pelo ambiente:

```text
drizzle/0000_fancy_sumo.sql
drizzle/0001_condemned_maelstrom.sql
drizzle/0002_watery_stark_industries.sql
```

A segunda migração preserva os dados existentes, libera o mesmo e-mail em
condomínios diferentes e cria outbox, auditoria e campos de retenção. Depois do
deploy, abra **Administrar > Aplicar retenção agora** para preencher a expiração
das fotos antigas e cifrar códigos legados; o job agendado faz a mesma conversão
em lotes pequenos e idempotentes.

## 3. WhatsApp Business Platform

No aplicativo da Meta:

1. cadastre e valide o número comercial;
2. crie e aprove o modelo `encomenda_recebida` (ou outro nome configurado);
3. use cabeçalho de imagem e quatro variáveis de corpo, nesta ordem: nome do
   morador, condomínio, descrição e código de retirada;
4. conceda ao token somente as permissões necessárias ao número;
5. configure o webhook HTTPS
   `https://portal.exemplo.com/api/webhooks/whatsapp` e assine os eventos de
   status de mensagens.

Configure como segredos/variáveis na hospedagem:

```text
WHATSAPP_PROVIDER=cloud_api
WHATSAPP_CLOUD_API_TOKEN=<token protegido>
WHATSAPP_PHONE_NUMBER_ID=<id do número>
WHATSAPP_GRAPH_API_VERSION=<versão suportada, no formato vXX.X>
WHATSAPP_TEMPLATE_NAME=encomenda_recebida
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_REQUEST_TIMEOUT_MS=10000
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<segredo aleatório>
WHATSAPP_APP_SECRET=<app secret da Meta>
```

Nunca exponha o token no cliente nem o grave no D1. A versão da Graph API é
explícita para que a atualização seja uma decisão operacional consciente.

## 4. Fila e agendamento

A outbox em `notification_jobs` sempre é criada atomicamente com a encomenda.
Para processamento assíncrono, vincule uma Cloudflare Queue como
`NOTIFICATION_QUEUE` ao produtor e ao consumidor deste Worker. Configure também
um gatilho agendado (recomendado: a cada 5 minutos) para:

- recuperar jobs pendentes ou travados;
- aplicar a retenção de fotos;
- converter códigos legados em texto puro para o formato cifrado atual;
- remover uploads órfãos do R2 depois da carência de segurança.

Sem a Queue, o primeiro envio ocorre durante a requisição com timeout explícito;
a outbox continua durável. O administrador pode executar os jobs pendentes em
**Administrar**.

## 5. Aceite antes de dados reais

1. Entre com o e-mail exato da allowlist e remova a allowlist após o bootstrap,
   se a política da organização assim exigir.
2. Crie um segundo condomínio e confirme que a troca não mistura moradores,
   fotos, acessos, encomendas nem auditoria.
3. Cadastre um morador de homologação com consentimento de WhatsApp.
4. Registre uma etiqueta, altere o texto e confirme que a seleção anterior some.
5. Repita a mesma requisição e confirme que existe uma única encomenda.
6. Teste entrega, cinco erros, bloqueio e desbloqueio administrativo.
7. Force uma falha da Meta, processe a fila e use **Reenviar aviso**.
8. Execute retenção e confirme que a foto expirada retorna 404.
9. Faça e restaure um backup de homologação seguindo `docs/OPERATIONS.md`.

## 6. Migração temporária do serviço não oficial

Baileys fica desabilitado por padrão. Se for indispensável manter o piloto por
um período curto, configure explicitamente:

```text
WHATSAPP_PROVIDER=baileys
ALLOW_LEGACY_BAILEYS=true
WHATSAPP_SERVICE_URL=https://servico-legado.exemplo.com
WHATSAPP_SERVICE_TOKEN=<segredo independente>
```

Registre data e responsável pela desativação. Esse modo não substitui a Cloud
API em uma operação comercial.
