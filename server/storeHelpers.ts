/**
 * Sob encomenda: ligado no produto, e (sem data de corte OU ainda antes
 * dela). Mesma regra pra Loja Pública e pro App do Vendedor — um produto
 * "sob encomenda" não precisa de estoque em nenhum dos dois lugares.
 */
export function isProductOnPreOrder(p: { allowPreOrder: boolean; preOrderUntil: Date | null }, now: Date = new Date()): boolean {
  return p.allowPreOrder && (!p.preOrderUntil || now <= p.preOrderUntil);
}
