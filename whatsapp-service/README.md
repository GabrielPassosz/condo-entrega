# Serviço WhatsApp legado do CondoEntrega

> **Descontinuado para novas instalações.** O portal usa a WhatsApp Business
> Platform oficial. Mantenha este processo apenas durante uma migração com
> prazo definido; ele exige `ALLOW_LEGACY_BAILEYS=true` no portal.

Este processo mantém a sessão do WhatsApp conectada e expõe somente uma API
protegida para o portal. Ele não precisa exibir o QR Code no terminal: o portal
consulta `/qr` e mostra a imagem na área administrativa.

## Executar localmente

1. Copie `.env.example` para `.env` e crie um token forte.
2. Instale com `npm install`.
3. Inicie com `npm start`.
4. No portal, configure a mesma URL e o mesmo token.

Mantenha `DATA_DIR` em armazenamento persistente. A pasta contém credenciais da
sessão do WhatsApp e nunca deve ser publicada ou compartilhada.

O serviço utiliza Baileys, uma integração não oficial, sem garantia de protocolo
ou de continuidade do número. Não o use como canal comercial definitivo.
