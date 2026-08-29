# CondoEntrega

Portal web responsivo para o recebimento de encomendas em condomínios. O
porteiro abre a plataforma no celular ou computador, fotografa a etiqueta,
confere o morador sugerido e registra a chegada. O morador recebe a foto pelo
WhatsApp e acompanha suas próprias encomendas no portal.

O projeto não depende de Streamlit nem de um computador na portaria.

## Fluxo implementado

1. O porteiro abre **Receber** e usa a câmera do navegador ou envia uma foto.
2. O navegador tenta ler QR Code/código de barras e executa OCR na etiqueta.
3. A API cruza nome, bloco, apartamento e unidade com a lista de moradores.
4. O porteiro precisa confirmar o morador; o envio nunca é automático sem essa
   confirmação.
5. A foto é armazenada em R2 e os dados são registrados em D1.
6. O serviço WhatsApp envia foto, descrição e código de retirada.
7. Na entrega, a portaria valida o código de seis dígitos e registra quem
   retirou. Cinco códigos errados bloqueiam novas tentativas para aquela
   encomenda.

## Perfis e privacidade

- **Administrador:** moradores, importação de planilha, acessos, encomendas e
  conexão do WhatsApp.
- **Portaria:** fotografia, leitura, registro, consulta e retirada.
- **Morador:** somente suas encomendas, fotos e códigos de retirada.

O primeiro usuário autenticado cria o condomínio e se torna administrador. Os
demais precisam ter o e-mail vinculado na tela **Moradores > Acessos**. Um
morador também pode ser vinculado automaticamente quando seu e-mail no cadastro
é igual ao e-mail usado para entrar.

As rotas de foto e dados validam o perfil no servidor. Uma URL de imagem não dá
acesso à foto de outro morador.

## Componentes

- Next.js/Vinext em Cloudflare Workers.
- Cloudflare D1 para moradores, perfis, encomendas e histórico de avisos.
- Cloudflare R2 para fotos privadas.
- OCR no navegador com Tesseract.js.
- Barcode Detection API do navegador quando disponível, com preenchimento
  manual como alternativa.
- Serviço Node separado em `whatsapp-service/`, usando Baileys e armazenamento
  persistente para a sessão.

## Configuração do portal

As ligações `DB` e `BUCKET` estão declaradas em `.openai/hosting.json`. Configure
as variáveis descritas em `.env.example` no ambiente de hospedagem:

- `CONDOMINIUM_NAME`
- `WHATSAPP_SERVICE_URL`
- `WHATSAPP_SERVICE_TOKEN`
- `SITE_ORIGIN`

Para desenvolvimento, use Node.js 22 ou superior:

```bash
npm install
npm run db:generate
npm run dev
```

A migração inicial está em `drizzle/0000_fancy_sumo.sql`.

## Lista de moradores

Uma planilha pronta está em `docs/moradores_modelo.xlsx`. A primeira linha deve
usar títulos como:

- `Nome`
- `Telefone` — DDI + DDD + número, por exemplo `5541999998888`
- `Unidade`, ou a combinação `Bloco` e `Apartamento`
- `Email`, `Autorizados` e `Observacoes` são opcionais

A importação aceita até 2.000 linhas por arquivo e relata as linhas inválidas.

## Conexão do WhatsApp dentro do portal

O administrador tem duas opções na tela **WhatsApp**:

- **QR Code:** ideal quando o portal está aberto em outro celular ou computador.
- **Código de pareamento:** ideal quando o portal está aberto no mesmo telefone
  do WhatsApp, pois não é possível apontar a câmera para a própria tela.

O QR Code é transformado em imagem pelo serviço e exibido somente ao
administrador autenticado. O terminal nunca precisa mostrar o código.

Veja `whatsapp-service/README.md` e `DEPLOY.md` para publicar o serviço.

## Verificação antes de produção

- Troque todos os valores de exemplo por segredos fortes.
- Use HTTPS no portal e no serviço WhatsApp.
- Mantenha `DATA_DIR` em volume persistente e fora de backups públicos.
- Faça um teste com um número e um morador de homologação.
- Confira foto, texto, código, retirada e isolamento entre dois moradores.
- Defina uma política de retenção das fotos adequada ao condomínio e à LGPD.

Baileys é uma integração não oficial. Para alta escala ou operação que exija
suporte oficial, substitua o serviço pela WhatsApp Business Platform mantendo o
mesmo contrato interno de envio.
