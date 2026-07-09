# Análise do Problema de Geração de Rotas

## Problema Reportado
"O Google Maps não conseguiu gerar rotas válidas para estes endereços."

## Localização do Erro
Arquivo: `server/routers/routeOptimization.ts`, linha 232

## Análise do Código

### Problema 1: Estrutura do Request para a Route Optimization API
O Google Maps Route Optimization API espera uma estrutura específica no body.
Atualmente o código envia:
```json
{
  "model": {
    "shipments": [...],
    "vehicles": [...],
    "routeModifiers": {...}
  },
  "routingPreference": "TRAFFIC_AWARE"
}
```

Mas a API oficial do Google Maps Route Optimization espera:
```json
{
  "model": {
    "shipments": [...],
    "vehicles": [...]
  },
  "routingPreference": "TRAFFIC_AWARE",
  "optimizeToursRequest": {...}
}
```

O `routeModifiers` deveria estar dentro do objeto principal, não dentro de `model`.

### Problema 2: Propriedades inválidas nos vehicles
O código inclui `costPerKilometer` e `costPerHour` nos vehicles, mas a API pode não reconhecer essas propriedades.

### Problema 3: Tratamento de erro genérico
Quando a API retorna um erro (como "INVALID_ARGUMENT"), o código captura o erro mas retorna null, e depois o router mostra a mensagem genérica "O Google Maps não conseguiu gerar rotas válidas".

### Problema 4: Estrutura do shipments
A API espera shipments com `id` opcional, mas o código não inclui o `id` do shipment no request.

### Problema 5: Falta de fieldMask
A API de Route Optimization pode precisar de um fieldMask para retornar os dados corretamente.

## Solução Proposta
1. Corrigir a estrutura do request para a API oficial do Google
2. Melhorar o tratamento de erros para mostrar mensagens mais específicas
3. Adicionar fallback local quando a API do Google falhar (usando o algoritmo de agrupamento por proximidade)
4. Corrigir as propriedades dos vehicles para usar apenas as propriedades válidas
