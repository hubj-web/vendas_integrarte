/**
 * Sob encomenda: ligado no produto, e (sem data de corte OU ainda antes
 * dela). Mesma regra pra Loja Pública e pro App do Vendedor — um produto
 * "sob encomenda" não precisa de estoque em nenhum dos dois lugares.
 */
export function isProductOnPreOrder(p: { allowPreOrder: boolean; preOrderUntil: Date | null }, now: Date = new Date()): boolean {
  return p.allowPreOrder && (!p.preOrderUntil || now <= p.preOrderUntil);
}

/**
 * Confere se uma forma de entrega fica grátis pra esse carrinho, por causa
 * de alguma regra configurada nela (qualquer uma satisfeita já libera).
 */
export function isDeliveryFreeForCart(
  rules: { ruleType: "valor_minimo" | "quantidade_produto"; minOrderValue: string | null; productId: number | null; minQuantity: number | null; active: boolean }[],
  cartTotal: number,
  quantityByProductId: Record<number, number>,
): boolean {
  return rules.some(r => {
    if (!r.active) return false;
    if (r.ruleType === "valor_minimo") return r.minOrderValue != null && cartTotal >= Number(r.minOrderValue);
    if (r.ruleType === "quantidade_produto") return r.productId != null && r.minQuantity != null && (quantityByProductId[r.productId] ?? 0) >= r.minQuantity;
    return false;
  });
}
