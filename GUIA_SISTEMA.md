# Sistema Vendas Integrarte — Guia das Partes e Fluxos

Este documento explica o que existe em cada área do sistema e como as três operações principais funcionam na prática: venda pelo vendedor, venda pela loja pública, e entrega. (A área de Gestão/ERP não está incluída aqui.)

---

## 1. As áreas do sistema

O sistema tem **quatro portas de entrada** diferentes, cada uma com seu próprio login (ou sem login, no caso da loja):

### CRM Integrarte (administrador)
Acesso com login de administrador. É onde tudo é configurado e acompanhado. Os menus são:

**Operação do dia a dia**
- **Dashboard** — visão geral
- **Pedidos** — todos os pedidos do período de vendas
- **Rotas de Entrega** — montar e acompanhar rotas
- **Empacotamento** — controle de itens empacotados
- **Entregas** — status de entrega e pagamento
- **Relatórios** — relatórios gerais
- **Produção/Fornecedores** — relatório de produção
- **Exportações** — exportar PDFs de rotas, etc.
- **Loja Pública** — painel completo da loja on-line (detalhado na seção 3)

**Configurações**
- **Categorias** — categorias de produto
- **Clientes** — cadastro de clientes
- **Produtos** — cadastro de produtos (preço, sabores, grupos de variação, imagem, tamanho de destaque, e agora também o controle "Na Loja")
- **Fornecedores** — cadastro de fornecedores
- **Formas de Entrega** — retirada, entrega em domicílio, etc.
- **Estoque** — estoque real (Estoque Integrarte), com o botão "Adicionar Manualmente"
- **Pedidos de Estoque** — fluxo de compra com fornecedor
- **Período de Vendas** — abre/fecha o período de vendas mensal
- **Usuários** — cadastro de vendedores, entregadores e administradores
- **Backup**

### Vendas (app do vendedor)
Acesso próprio, com login de vendedor (`/vendedor`). Menu:
- **Novo Pedido** — lançar pedido do período de vendas mensal
- **Meus Pedidos** — pedidos que esse vendedor lançou
- **Estoque** — consulta do estoque atual
- **Evento** — lançar venda de ingresso/produto de um Evento da Loja (novo)

### Entregador
Acesso próprio, com login de entregador (`/entregador`). Só tem a rota do dia, com os pedidos pra entregar.

### Loja Pública
Sem login nenhum — link direto (`/loja`). É onde o cliente final compra sozinho, pela internet.

---

## 2. Fluxo de vendas pelo app (vendedor — período de vendas)

Esse é o fluxo tradicional, mensal, sem depender de estoque.

1. **Administrador abre o período de vendas** em Configurações → Período de Vendas, definindo data de abertura e fechamento.
2. **Vendedor loga** em `/vendedor` e vai em **Novo Pedido**.
3. Enquanto o período está aberto, o vendedor pode vender **qualquer produto cadastrado**, mesmo sem ter estoque físico ainda (a compra com fornecedor ainda vai acontecer depois, com base no total vendido).
4. O vendedor escolhe o cliente (ou cadastra um novo), os produtos, sabores, quantidade, forma de pagamento combinada, e finaliza o pedido.
5. Depois que o período fecha, a instituição sabe o total vendido de cada produto e faz a compra com o fornecedor (**Pedidos de Estoque**) — ao marcar como "Recebido", o estoque real é abastecido.
6. A partir daí, os pedidos entram no fluxo de **Empacotamento** e **Rotas de Entrega**.
7. O vendedor é responsável por cobrar o cliente e atualizar o status de pagamento em **Meus Pedidos**.

### Venda de ingresso/produto de evento pelo vendedor
Pelo mesmo app (`/vendedor/evento`), o vendedor também pode lançar, presencialmente, a venda de um ingresso ou produto vinculado a um **Evento da Loja** (ver seção 3):
1. Escolhe o evento aberto.
2. Escolhe o(s) produto(s)/ingresso(s) (o estoque é descontado na hora — diferente do período de vendas).
3. Informa nome e telefone do cliente, e a forma de pagamento (combinada diretamente, sem gateway).
4. O sistema gera um **link com QR code de comprovante**, que o vendedor copia ou envia direto pelo WhatsApp pro cliente.

---

## 3. Fluxo de venda pela loja (configuração da Loja Pública)

Esse é o fluxo da loja on-line — sempre baseado em **estoque real**, nunca vende o que não existe fisicamente.

### Passo a passo pra colocar um produto à venda

1. **Cadastre a categoria** (Configurações → Categorias) — nome, imagem (opcional) e tamanho de destaque (Pequeno/Médio/Grande).
2. **Cadastre o produto** (Configurações → Produtos), vinculado a essa categoria — preço, imagem, e se precisar de sabor, tamanho, cor ou **grupos de variação** (ex: um marmitex com "Tipo de Macarrão" + "Tipo de Molho" ao mesmo tempo — configurado pelo ícone de camadas na tabela de produtos).
3. **Lance o estoque** desse produto (Estoque → Adicionar Manualmente) — e já deixe o interruptor **"Disponibilizar na Loja Pública agora"** ligado, que ativa tudo num passo só.
   - Se preferir fazer depois, também dá pra ligar/desligar e mudar o preço da loja direto na coluna **"Na Loja"**, na própria tela de Produtos.

### Dois tipos de "loja"

- **Venda Regular** — a loja sempre aberta (Loja Pública → interruptor no topo). Mostra automaticamente toda categoria que tiver produto visível em estoque — **exceto** categorias vinculadas a algum Evento, que ficam escondidas de lá por padrão (pra não misturar ingresso com produto do dia a dia). Dá pra liberar isso manualmente na aba "Venda Regular", se quiser.
- **Eventos** (Loja Pública → aba Eventos) — pra ocasiões específicas (um baile, uma festa). Cada evento tem:
  - Nome, tipo (Ingresso ou Venda de Produtos), data, imagem/banner
  - **Categorias vinculadas** (aba "Categorias" dentro do card do evento) — só essas aparecem quando o cliente entra nesse evento
  - Aberto/fechado, independente da Venda Regular

Quando **mais de uma opção estiver aberta ao mesmo tempo** (Venda Regular + um ou mais eventos), o cliente vê uma tela de escolha ao entrar em `/loja`. Se só tiver uma opção ativa, ele entra direto.

### O que o cliente vê e faz
1. Escolhe a opção (se houver mais de uma) → escolhe a categoria → escolhe o produto.
2. Se o produto tiver variação (sabor ou grupos), escolhe as opções.
3. Define a quantidade e clica em **Inserir** — item entra no carrinho, carrinho e total ficam sempre visíveis.
4. Clica em **Pagar** → informa nome, telefone, forma de entrega → escolhe pagamento:
   - **PIX**: gera QR code direto pro CNPJ da instituição — confirmação de pagamento é **manual**, feita pelo administrador em Loja Pública → Pedidos → "Confirmar Pagamento".
   - **Cartão de crédito**: via Mercado Pago (Payment Brick).
5. Recebe um **recibo com QR code** (link próprio, `/loja/r/{código}`), que também serve de comprovante de ingresso quando aplicável.

### Acompanhando os pedidos da loja
Loja Pública → aba **Pedidos**: lista todos os pedidos (loja pública + vendas de evento do vendedor), com filtro por evento (ou só Venda Regular). Clicar numa linha abre o detalhe completo do pedido.

---

## 4. Fluxo de utilização do entregador

1. **Administrador cria o usuário do entregador** em Configurações → Usuários, com a função "Entregador".
2. **Administrador monta a rota** em Rotas de Entrega — agrupando os pedidos já empacotados por região/ordem de entrega, e atribuindo essa rota ao entregador.
3. **Entregador loga** em `/entregador` com seu usuário.
4. Vê a **rota do dia** — lista de paradas na ordem definida, com endereço e itens de cada pedido.
5. Ao chegar em cada parada, marca a entrega como concluída (com foto de comprovante, quando aplicável).
6. O administrador acompanha o progresso da rota em tempo real pela tela de Rotas de Entrega / Entregas, no CRM.

---

## Resumo visual dos três fluxos

| | Onde acontece | Quem faz | Precisa de estoque? | Pagamento |
|---|---|---|---|---|
| **Venda por período** | App do Vendedor | Vendedor | Não (compra depois) | Combinado, atualizado manualmente |
| **Venda pela Loja** | `/loja` (sem login) | Cliente final | Sim, sempre | PIX (manual) ou Cartão (Mercado Pago) |
| **Venda de evento pelo vendedor** | App do Vendedor → Evento | Vendedor | Sim, desconta na hora | Combinado, já marcado como pago |
| **Entrega** | App do Entregador | Entregador | — | — |
