# Incompatibilidade de Banco de Dados Detectada

O código atual do projeto (`schema.ts` e routers) espera uma estrutura de categorias relacional:
- Tabela `product_categories`
- Coluna `categoryId` em `product_types`

No entanto, o banco de dados real (como visto em `dbSetup.ts` e migrations SQL) usa um modelo legado:
- Sem tabela `product_categories`
- Coluna `category` (string) diretamente em `product_types`

## Ações Tomadas
1. Ajustada a query `seller.catalog` no arquivo `server/routers/seller.ts` para ler a coluna `category` como `categoryName`.
2. Ajustado o frontend em `client/src/pages/seller/SellerNewOrder.tsx` para garantir que o agrupamento funcione com strings.
3. Corrigido o erro de `NaN` na criação de pedidos em `server/routers/orders.ts` e `server/routers/seller.ts`.
4. Implementada a lógica de endereço dinâmico na entrega gratuita.
5. Padronizada a interface de adição de produtos com o prefixo "Adicionar [Tipo]".
