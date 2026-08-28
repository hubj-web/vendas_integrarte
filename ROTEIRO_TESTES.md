# Roteiro de Testes — Ambiente de DEV (do zero)

Marque cada item conforme for testando. Se algo não se comportar como descrito, anota o que apareceu (print ajuda) e me manda.

**Antes de começar:** confirme que está no Ambiente de DEV (`vendasintegrarte-ambiente-de-dev.up.railway.app`), nunca em produção.

---

## 1. Configuração básica

- [ ] **Formas de Entrega** → criar pelo menos 2: uma "Retirada" (sem endereço) e uma "Entrega em domicílio" (com endereço), uma delas com **custo** preenchido (ex: R$ 8,00 na entrega)
- [ ] **Formas de Pagamento** (Loja Pública → aba "Formas de Pagamento") → confirme que aparecem as 4 formas (PIX Loja, Cartão Loja, Dinheiro Vendedor, PIX Vendedor), todas ativas por padrão

## 2. Catálogo

- [ ] **Categorias** → criar 2 categorias (ex: "Salgados", "Bebidas"), com imagem em pelo menos uma, e tamanhos de destaque diferentes (uma Grande, outra Média)
- [ ] **Produtos** → criar 1 produto simples (sem variação) numa categoria
- [ ] Criar 1 produto **com sabor** (ex: Suco — sabores Laranja/Uva)
- [ ] Criar 1 produto **com grupo de variação múltipla** (ex: Marmitex — grupo "Tipo de Macarrão" + grupo "Molho", cada um com 2-3 opções, uma delas com preço adicional)
- [ ] Confirme que a coluna **"Na Loja"** aparece na tabela de Produtos, mostrando "Sem estoque" pra todos ainda

## 3. Estoque

- [ ] **Estoque → Adicionar Manualmente**: lance estoque do produto simples, com o toggle **"Disponibilizar na Loja Pública agora"** ligado
- [ ] Lance estoque do produto com sabor, escolhendo 1 sabor específico
- [ ] Lance estoque com **lote e validade** preenchidos (data próxima, tipo daqui 3 dias) — confirme que aparece o aviso "Vence em X dias"
- [ ] Confirme na coluna **"Na Loja"** de Produtos que os itens lançados já aparecem com o interruptor ligado

## 4. Venda Regular (Loja Pública)

- [ ] Loja Pública → ligar o interruptor **"Loja aberta"**
- [ ] Acessar `/loja` (aba anônima) → confirmar que entra direto (só uma opção ativa) e mostra a categoria/produtos lançados
- [ ] Escolher o produto com sabor → selecionar sabor → quantidade → **Inserir** → confirmar que **não sai da tela** e o carrinho/total atualiza
- [ ] Escolher o produto com grupo de variação (marmitex) → selecionar as opções → conferir que o preço soma o adicional corretamente
- [ ] Clicar em **Pagar** → preencher nome/telefone → escolher forma de entrega **com custo** → confirmar que o total soma o valor da entrega
- [ ] Pagar com **PIX** → confirmar que aparece o QR code
- [ ] Ir no painel **Loja Pública → Pedidos** → **Confirmar Pagamento** desse pedido → voltar na aba do cliente e ver se o recibo atualiza sozinho (a cada 15s) mostrando "Pago"
- [ ] Abrir o link do recibo (`/loja/r/...`) e conferir se aparece QR code, itens, variações escolhidas, e a linha de custo de entrega

## 5. Eventos

- [ ] Loja Pública → aba **Eventos** → criar um evento (ex: "Baile de Massas"), tipo "Venda de Produtos", com imagem
- [ ] Vincular uma categoria a esse evento (botão "Categorias")
- [ ] Abrir o evento (toggle "aberto") — com a Venda Regular **também** aberta ao mesmo tempo
- [ ] Acessar `/loja` de novo → confirmar que aparece a **tela de escolha** entre "Venda Regular" e o evento
- [ ] Confirmar que o produto da categoria vinculada ao evento **não aparece mais** na Venda Regular (a menos que você tenha liberado manualmente na aba "Venda Regular")
- [ ] No evento, testar o botão **"Pagamento"** → desligar o Cartão só pra esse evento → conferir no checkout desse evento que só aparece PIX
- [ ] Testar o botão **"Janela de venda"** → colocar uma data de início no futuro → confirmar que o evento fica escondido da tela inicial até essa data chegar (ou simular alterando a data pra já ter passado)

## 6. Pré-venda / Sob encomenda (Item A e B)

- [ ] **Configurações → Produtos** → marcar um produto como **"Vender sob encomenda"**
- [ ] **Configurações → Período de Vendas** → criar um período ativo (abertura no passado, fechamento no futuro), **sem** data de corte ainda
- [ ] Acessar `/loja` → confirmar que o produto sob encomenda aparece com o selo **"Sob encomenda"**, mesmo sem estoque
- [ ] Comprar esse produto pela loja → confirmar que o pedido é criado sem erro de estoque
- [ ] Editar o período e preencher uma **data de corte** já passada (ex: ontem) → confirmar que o card mostra "Só com estoque" e que o produto sob encomenda **some** da loja (porque não tem estoque real)
- [ ] Sem data de corte (ou antes dela), ir no **App do Vendedor → Novo Pedido** → confirmar que consegue lançar pedido do mesmo produto sem estoque, normalmente

## 7. Vendedor — Venda de Evento

- [ ] App do Vendedor → aba **Evento** → escolher o evento criado → adicionar um item → informar nome/telefone do cliente → **Registrar venda**
- [ ] Confirmar que aparece o link com QR code pra copiar/mandar por WhatsApp
- [ ] Abrir esse link e conferir que o recibo aparece certinho

## 8. Pedidos (fila única)

- [ ] CRM → **Pedidos** → testar os chips de visão: "Todos", "Período", "Loja e Eventos", "Aguardando Pagamento", "Pra Produzir", "Pra Empacotar", "Retiradas de Hoje", "Em Atraso"
- [ ] Confirmar que a coluna **"Origem"** mostra corretamente Período / Loja / nome do evento pra cada pedido
- [ ] Loja Pública → aba **Pedidos** → testar o filtro por evento → clicar numa linha → confirmar que abre o **detalhe completo** (itens, variações, endereço)

## 9. Fluxo de entrega

- [ ] Levar um pedido de "Produção" até "Empacotado" (tela **Empacotamento**)
- [ ] Criar uma rota em **Rotas de Entrega**, incluindo esse pedido
- [ ] Logar como **Entregador** → conferir que a rota aparece com os pedidos certos
- [ ] Marcar a entrega como concluída

## 10. Auditoria

- [ ] **Configurações → Atividades** → conferir que aparecem registros de tudo que você fez: abrir/fechar loja, ativar produto, confirmar pagamento, abrir/fechar evento

---

## Coisas específicas pra prestar atenção (bugs que já corrigimos — confirma que continuam corrigidos)

- [ ] Clicar em "Inserir" na loja **não** te joga de volta pra tela inicial
- [ ] O formulário de "Novo Produto" **rola até o fim** (não corta o botão Salvar)
- [ ] Categoria vinculada a evento **não aparece automaticamente** na Venda Regular
