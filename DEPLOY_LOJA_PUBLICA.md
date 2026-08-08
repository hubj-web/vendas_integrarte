# Loja Pública — Guia de Deploy

Tudo que foi criado é **aditivo**: nenhuma tabela, tela ou fluxo existente foi alterado
no comportamento. Siga os passos abaixo para colocar no ar.

## 1. Rodar a migração no banco

O projeto aplica migrações manualmente no MySQL do Railway (os arquivos `0003` a
`0012` já seguem esse padrão — não passam pelo `drizzle-kit migrate`). Faça o mesmo
com `drizzle/0013_loja_publica.sql`:

1. Abra o serviço **MySQL** no Railway → aba "Data" (ou conecte via `mysql` client
   usando as credenciais em Variables do serviço MySQL)
2. Execute o conteúdo de `drizzle/0013_loja_publica.sql` inteiro

Isso cria as tabelas novas (`store_settings`, `store_product_visibility`,
`store_order_payments`), adiciona a coluna `channel` em `orders`, libera
`credit_card` como forma de pagamento, e cria o usuário de sistema "Loja Pública"
(sem senha, não consegue logar — só serve pra satisfazer o campo obrigatório
`launcherId` dos pedidos).

## 2. Configurar variáveis de ambiente (serviço `vendas_integrarte` no Railway)

| Variável | Valor |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token da sua conta Mercado Pago (Produção) |
| `MERCADOPAGO_PUBLIC_KEY` | Public Key da mesma conta (usada no navegador do cliente) |
| `APP_URL` | `https://www.integrarte.app.br` (já é o padrão no código, só defina explicitamente se quiser garantir) |

Pegue essas chaves em: **Mercado Pago → Seu negócio → Configurações → Credenciais de produção**.

## 3. Webhook do Mercado Pago

Não precisa cadastrar nada manualmente — cada pagamento já é criado com
`notification_url` apontando para:

```
https://www.integrarte.app.br/api/webhooks/mercadopago
```

## 4. Abrir a loja

1. Faça login no CRM Integrarte → menu **Loja Pública**
2. Ative o botão "Loja aberta"
3. Na aba **Produtos na Loja**, marque quais produtos do Estoque aparecem
   (nenhum aparece por padrão — é opt-in) e, se quiser, defina um preço
   diferente do praticado no período de vendas
4. O link público é: `https://www.integrarte.app.br/loja`

## 5. Testando

- Faça uma compra teste via PIX (o Mercado Pago em produção permite testar com
  valores baixos e você mesmo pagando)
- Confirme que o pedido aparece na aba **Pedidos** do painel Loja Pública com
  status "Pago"
- Se escolher "Entrega em domicílio", confirme que o pedido aparece na tela
  normal de **Rotas de Entrega** junto com os pedidos do período — nenhuma
  mudança foi feita nessa tela, ela já filtra por cliente não-interno e
  status `production`/`packaged`, que é exatamente como os pedidos da loja
  são criados

## O que NÃO foi tocado
- Fluxo de período de vendas (`seller.ts`, telas do vendedor)
- Fluxo de estoque manual/fornecedor (`estoque.ts`, Pedidos de Estoque)
- Rotas de entrega, empacotamento, relatórios existentes
- Qualquer tela do CRM/ERP Integrarte já existente

Único ponto de reaproveitamento (sem alteração de comportamento): as funções
`buscarLotesEstoque`/`descontarLotesEstoque`/`periodoVendaAtivo` em
`server/routers/seller.ts` ganharam a palavra `export` para serem reaproveitadas
pela Loja Pública — a lógica interna é idêntica à que já existia.
