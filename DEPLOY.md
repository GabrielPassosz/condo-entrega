# Publicação do CondoEntrega

## 1. Portal web

O portal precisa de uma hospedagem compatível com Cloudflare Workers, D1 e R2.
Antes da primeira abertura, aplique `drizzle/0000_fancy_sumo.sql` ao banco e
confirme as ligações:

- D1: `DB`
- R2: `BUCKET`

Configure `CONDOMINIUM_NAME` e, após conhecer o endereço definitivo,
`SITE_ORIGIN` com a origem HTTPS completa.

O acesso usa Sign in with ChatGPT. A política de acesso da hospedagem deve
permitir os usuários desejados; dentro do portal, o administrador vincula cada
e-mail como portaria, morador ou outro administrador.

## 2. Serviço WhatsApp

Publique a pasta `whatsapp-service/` em um host Node.js 20+ que ofereça:

- HTTPS;
- processo sempre ligado;
- volume persistente montado em um caminho como `/data`;
- variáveis de ambiente secretas.

O `Dockerfile` pode ser usado diretamente. Configure no serviço:

```text
PORT=3001
DATA_DIR=/data
WHATSAPP_SERVICE_TOKEN=<segredo aleatório com pelo menos 32 caracteres>
LOG_LEVEL=info
```

Gere o segredo localmente e não o envie por mensagens ou repositórios:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Depois configure no portal:

```text
WHATSAPP_SERVICE_URL=https://endereco-do-servico
WHATSAPP_SERVICE_TOKEN=<o mesmo segredo>
```

Teste `GET /health` no serviço. O resultado deve indicar que o processo iniciou;
as outras rotas exigem o token.

## 3. Primeira conexão

1. Entre como administrador e abra **WhatsApp**.
2. Com outro aparelho, escolha **Mostrar QR Code** e leia pelo WhatsApp.
3. No mesmo telefone, informe o número com DDI e DDD e gere o código de oito
   dígitos.
4. Aguarde a tela mudar para **WhatsApp conectado**.

O conteúdo de `DATA_DIR` mantém a sessão. Se o volume for apagado, será preciso
parear novamente.

## 4. Teste de aceite

1. Importe dois moradores de teste com telefones diferentes.
2. Fotografe uma etiqueta nítida e confirme a sugestão correta.
3. Verifique se a mensagem chegou com a foto e o código.
4. Entre como morador e confirme que somente as próprias encomendas aparecem.
5. Na portaria, tente um código errado e depois valide o correto.
6. Confirme no histórico a data e o nome de quem retirou.

Não use dados reais antes de concluir este teste.
