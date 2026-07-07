# Estrutura do Banco de Dados - Integrarte

## Hierarquia de Produtos
- `product_categories` → categorias gerais (ex: Congelados, MiniPizzas, Geleias)
  - campos: id, name, description, sortOrder, active
- `product_types` → tipos dentro de uma categoria (ex: Pão de Queijo, Biscoito)
  - campos: id, name, categoryId, description, active
- `products` → produtos específicos com preço
  - campos: id, name, productTypeId, unit, price, description, active

## Tabelas Específicas (fixas no código - DEVEM SER REMOVIDAS)
- `minipizza_types` → tipos de minipizza (ex: 10 unidades, 20 unidades)
- `minipizza_flavors` → sabores de minipizza
- `minipizza_type_flavor_matrix` → compatibilidade tipo × sabor
- `jelly_flavors` → sabores de geleia com preço
- `order_minipizzas` → itens de minipizza no pedido
- `order_minipizza_flavors` → sabores escolhidos
- `order_jellies` → geleias no pedido

## O que o usuário quer:
1. Categorias são criadas na área admin (dinâmico)
2. Produtos são cadastrados dentro das categorias
3. Na tela de pedidos, botões "Adicionar [Categoria]" gerados automaticamente
4. Produtos com especificidades (sabores) devem permitir seleção
5. MiniPizzas e Geleias NÃO devem ser fixos - devem ser categorias normais

## Solução:
- Usar product_categories como base para os botões na tela de pedidos
- Cada categoria gera um botão "Adicionar [nome]"
- Dentro de cada categoria, listar os products (via product_types)
- Para produtos que precisam de sabor/variação, usar um campo ou tabela genérica
