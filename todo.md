# Sistema de Gestão de Pedidos e Entregas — TODO

## Fase 1: Schema do Banco de Dados
- [x] Tabela users (estender com perfil: lançador, entregador, administrador, senha local)
- [x] Tabela product_types (tipos de produtos customizáveis)
- [x] Tabela products (produtos comuns)
- [x] Tabela minipizza_types (tipos de minipizza)
- [x] Tabela minipizza_flavors (sabores de minipizza)
- [x] Tabela minipizza_type_flavors (matriz de compatibilidade)
- [x] Tabela jelly_flavors (sabores de geleia)
- [x] Tabela delivery_methods (formas de entrega)
- [x] Tabela customers (clientes)
- [x] Tabela orders (pedidos)
- [x] Tabela order_items (itens de pedido — produtos comuns)
- [x] Tabela order_minipizzas (itens de pedido — minipizzas)
- [x] Tabela order_minipizza_flavors (sabores selecionados por item de minipizza)
- [x] Tabela order_jellies (itens de pedido — geleias)
- [x] Tabela delivery_routes (rotas de entrega)
- [x] Tabela route_orders (pedidos em uma rota)
- [x] Tabela delivery_records (registros de entrega)
- [x] Tabela payment_records (registros de pagamento)

## Fase 2: Tema Visual e Layout Base
- [x] Definir paleta de cores elegante (tons escuros/neutros sofisticados)
- [x] Configurar tipografia premium (Inter + Playfair Display)
- [x] Criar AppLayout customizado com sidebar refinada
- [x] Criar estrutura de navegação por perfil (lançador, entregador, administrador)
- [x] Criar página de login elegante com formulário de usuário/senha

## Fase 3: Autenticação
- [x] Backend: hash de senha com bcrypt
- [x] Backend: login com email/senha (JWT session)
- [x] Backend: reset de senha (modal na tela de login)
- [x] Frontend: página de login
- [x] Frontend: proteção de rotas por perfil (ProtectedRoute)
- [x] Frontend: redirecionamento por perfil após login

## Fase 4: Módulo de Administração
- [x] CRUD de tipos de produtos (customizáveis — inserir e remover livremente)
- [x] CRUD de produtos (com categoria, unidade, preço, status)
- [x] CRUD de tipos de minipizza
- [x] CRUD de sabores de minipizza
- [x] Matriz de compatibilidade tipo × sabor
- [x] CRUD de sabores de geleia com preço unitário próprio
- [x] CRUD de formas de entrega (customizáveis)
- [x] CRUD de usuários do sistema (com perfil e status)

## Fase 5: Lançamento de Pedidos
- [x] Busca de cliente por nome/telefone com autocomplete
- [x] Cadastro rápido de novo cliente
- [x] Seleção de produtos comuns com quantidade e subtotal
- [x] Fluxo de minipizza: tipo → sabores → quantidade (obrigatório)
- [x] Seleção de geleias com sabor e quantidade
- [x] Seleção de forma de entrega e endereço
- [x] Seleção de forma de pagamento (Dinheiro / PIX)
- [x] Resumo e confirmação do pedido

## Fase 6: Gestão de Pedidos
- [x] Listagem com paginação e filtros avançados
- [x] Visualização detalhada do pedido
- [x] Alteração de status
- [x] Cancelamento com justificativa obrigatória
- [x] StatusBadge com cores por status

## Fase 7: Rotas de Entrega
- [x] Criação de rota (data, entregador, seleção de pedidos)
- [x] Organização com drag-and-drop
- [x] Geração de link Google Maps com pontos na ordem definida
- [x] Status da rota (planejada → em andamento → concluída)
- [x] Listagem de rotas com filtros

## Fase 8: Entregas e Pagamentos
- [x] Registro de entrega (data/hora, entregador, observações)
- [x] Upload de foto de comprovante de entrega (base64 → S3)
- [x] Registro de pagamento (forma, valor, data)
- [x] Upload de foto de comprovante de pagamento PIX (base64 → S3)
- [x] Acompanhamento de pagamentos pendentes
- [x] Alerta visual para pedidos entregues há mais de 3 dias sem pagamento

## Fase 9: Relatórios e Dashboard
- [x] Dashboard: visão geral do dia (pedidos, pagamentos pendentes, rotas ativas)
- [x] Relatório de vendas por período (total, ticket médio, por lançador)
- [x] Produtos mais vendidos com gráfico de pizza
- [x] Relatório de entregas e desempenho por entregador
- [x] Relatório financeiro (recebido vs. pendente, PIX vs. Dinheiro)
- [x] Gráficos com recharts

## Fase 10: Alertas e Notificações
- [x] Handler de pagamentos em atraso (/api/scheduled/overdue-payments)
- [x] Notificação ao administrador via notifyOwner
- [x] Alerta visual na listagem de pagamentos pendentes
- [x] Cron job configurado (pós-deploy: executar manus-heartbeat create --name overdue-payments --cron "0 0 8 * * *" --path /api/scheduled/overdue-payments)

## Fase 11: Testes e Entrega
- [x] Testes unitários (vitest) para procedures principais (9/9 passando)
- [x] Verificação de TypeScript (0 erros)
- [x] Checkpoint final criado

## Reestruturação: Três Áreas Distintas

### Backend
- [x] Remover obrigatoriedade de login para área de vendedores e entregadores
- [x] Criar procedimentos públicos para vendedores (identificados por nome/seleção, sem senha)
- [x] Manter proteção de login apenas para rotas /admin/*
- [x] Filtrar pedidos por vendedor selecionado (sem autenticação)
- [x] Garantir que procedures admin continuem protegidas por role=admin

### Área do Vendedor (rota: /)
- [x] Tela inicial: seleção do vendedor (lista de nomes cadastrados, sem senha)
- [x] Lançamento de novo pedido (vinculado ao vendedor selecionado)
- [x] Listagem dos próprios pedidos lançados (filtro por status, data)
- [x] Visualização e cancelamento de pedido próprio
- [x] Layout limpo e focado, sem sidebar administrativa
- [x] Botão discreto de acesso ao admin (rodapé da tela de seleção)

### Área do Entregador (rota: /entregador)
- [x] Tela inicial: seleção do entregador (lista de nomes, sem senha)
- [x] Visualização das rotas atribuídas ao entregador selecionado
- [x] Registro de entrega com foto de comprovante
- [x] Layout separado e focado para uso em campo (mobile-friendly)

### Área Administrativa (rota: /admin)
- [x] Botão discreto na área do vendedor levando a /admin
- [x] Login com e-mail e senha (apenas admin)
- [x] Gestão completa: todos os pedidos, rotas, entregas, pagamentos, relatórios, configurações
- [x] Dashboard com visão geral

## Cadastro de Categorias Independente

- [ ] Criar tabela `product_categories` no banco de dados
- [ ] Migrar dados existentes de categoria (campo texto) para a nova tabela
- [ ] Atualizar tabela `product_types` para usar FK `categoryId` em vez de campo texto
- [ ] Criar router `catalog.categories` com CRUD completo no backend
- [ ] Atualizar router `catalog.productTypes` para incluir `categoryId`
- [ ] Criar página `/admin/categories` com CRUD de categorias
- [ ] Adicionar link de Categorias na sidebar administrativa
- [ ] Atualizar página de Tipos de Produto para selecionar categoria via dropdown
- [ ] Atualizar tela de lançamento de pedido para agrupar por categoria via JOIN
- [ ] Atualizar seller router para retornar categoria via JOIN

## Correção de Bug Crítico (Sessão Atual)

- [x] BUG CRÍTICO: Login do administrador não funciona — role sobrescrito para 'launcher' pelo upsertOAuthUser
  - Causa raiz: sdk.authenticateRequest chamava upsertUser (com role hardcoded 'launcher') para usuários já existentes
  - Correção: db.ts agora usa SELECT + UPDATE separados (nunca sobrescreve role); sdk.ts chama updateLastSignedIn em vez de upsertUser para usuários existentes
  - Banco corrigido: role='admin', loginMethod='local' para openId='local-admin'
  - 9/9 testes passando após correção
