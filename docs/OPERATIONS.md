# Operação, backups e política de dados

## Política técnica de dados

| Dado | Finalidade | Controle implementado | Prazo padrão |
|---|---|---|---|
| Foto da etiqueta | Conferência e retirada | R2 privado, rota autenticada, sem cache público e exclusão automática | 90 dias, configurável de 1 a 3.650 |
| Texto integral do OCR | Localizar o morador durante o recebimento | Processado em memória no navegador e **não persistido** em novos registros; versões antigas são limpas com a foto | Não se aplica / até expirar a foto legada |
| Código de retirada | Validar a entrega | AES-GCM para recuperação pelo morador, HMAC para validação, segredo fora do banco | Até a retirada; então é apagado |
| Telefone e e-mail do morador | Aviso e acesso | Escopo por condomínio, acesso por função, consentimento do WhatsApp, edição, desativação e anonimização | Enquanto houver finalidade; anonimizar mediante solicitação ou fim do vínculo |
| Perfil de acesso | Autorização | Identificador estável, convite, ativação/desativação e exclusão | Enquanto o acesso for necessário |
| Histórico e auditoria | Prestação de contas e segurança | Escopo por condomínio, acesso somente administrativo | Conforme obrigação contratual/legal definida pelo controlador |

O condomínio é o controlador dos dados e deve documentar base legal, prazo do
histórico e canal do titular. O padrão da aplicação minimiza os dados, mas não
substitui o registro de operações de tratamento nem a avaliação jurídica local.

A rotina agendada também elimina fotos vencidas e varre uploads sem referência
no D1. A varredura usa carência de 24 horas e cursor persistente, de modo que uma
interrupção entre R2 e D1 não deixe uma foto pessoal armazenada indefinidamente.

### Solicitação do titular

1. Localize o morador somente no condomínio correto.
2. Exporte as informações necessárias antes da exclusão, se houver obrigação de
   fornecimento.
3. Use **Desativar** quando o vínculo pode retornar.
4. Use **Anonimizar** para remover nome, telefone, e-mail, autorizados,
   observações, consentimento e acessos vinculados, preservando apenas o
   histórico operacional não identificável.
5. Use **Excluir acesso** para credenciais que não devem mais existir.
6. Registre fundamento, solicitante e conclusão fora do campo de observações do
   morador; a aplicação cria o evento técnico na auditoria.

## Rotina de backup

Backups também contêm dados pessoais. Use uma conta de serviço dedicada,
criptografia antes da transferência, MFA para operadores e um destino separado
do ambiente de produção.

Rotina recomendada:

- exportação diária do D1;
- cópia diária incremental dos objetos R2;
- retenção curta e definida (exemplo operacional: 35 dias), com exclusão
  automática no destino;
- manifesto por execução com data, ambiente, quantidade de objetos e SHA-256;
- alerta quando exportação, cópia ou verificação falhar;
- teste trimestral de restauração em um ambiente isolado.

Não inclua tokens, `.env`, sessões Baileys ou `PICKUP_CODE_SECRET` no mesmo
arquivo do backup. Guarde o segredo criptográfico no cofre corporativo com cópia
de recuperação separada e acesso auditado.

### Backup do D1

Use a exportação remota disponibilizada pelo painel/CLI do Cloudflare para gerar
um SQL consistente. Nomeie o arquivo com ambiente e UTC, compacte, cifre e gere
o hash antes de enviá-lo ao destino de backup. Confirme que as tabelas
`condominiums`, `profiles`, `residents`, `packages`, `notification_jobs`,
`message_logs` e `audit_logs` constam do inventário.

### Backup do R2

Copie somente o bucket privado da aplicação usando a API S3 compatível e uma
credencial limitada a leitura no bucket de origem e escrita no destino. Preserve
chave, ETag, tamanho e `Content-Type`. A política do destino deve apagar cópias
quando o prazo vencer; retenção infinita invalida a exclusão feita pela aplicação.

## Restauração testada

1. Abra um ambiente vazio e sem acesso público.
2. Restaure o D1 no ponto escolhido.
3. Restaure o R2 preservando exatamente as chaves.
4. Configure uma cópia segura do `PICKUP_CODE_SECRET` correspondente ao backup.
5. Aplique apenas migrações posteriores ao ponto restaurado.
6. Inicie com `WHATSAPP_PROVIDER=disabled` para impedir avisos acidentais.
7. Verifique contagens, relações, fotos de amostra e códigos de uma encomenda de
   homologação.
8. Processe a outbox somente depois de decidir quais jobs ainda devem ser
   enviados; restaurações podem trazer jobs antigos de volta.
9. Registre RPO, RTO, evidências e responsável pelo teste; destrua o ambiente de
   restauração com segurança.

## Resposta operacional

- **Avisos com falha:** abra a encomenda e use **Reenviar aviso**, ou processe a
  fila em **Administrar**.
- **Retirada bloqueada:** valide a identidade presencialmente e use
  **Desbloquear retirada**; nunca informe o código ao solicitante por telefone.
- **Foto ausente:** não recrie dados pessoais a partir de logs; confirme se a
  retenção venceu e registre a ocorrência.
- **Suspeita de acesso indevido:** desative o perfil, preserve a auditoria,
  rotacione tokens/segredos afetados e siga o plano de incidente do controlador.
