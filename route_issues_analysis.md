# Análise dos Problemas de Otimização de Rotas

## Problemas Identificados

### 1. Balanceamento desigual de rotas
- Rota 1: 10 entregas, ~41km rodados
- Rota 2: 12 entregas, ~30km rodados
- O algoritmo atual usa distância euclidiana (ar/linha reta) para agrupamento
- Distribui pedidos em ordem decrescente de distância da origem, mas o critério de balanceamento é a soma das distâncias euclidianas entre pedidos do cluster, não a distância real de rota (estrada)

### 2. KM mostrado diferente da realidade do Google Maps
- O fallback local usa distância euclidiana * 111000 (graus para metros aproximado)
- A API do Google Maps retorna distância real de estrada, mas o código lê `route.metrics.travelDistanceMeters || route.distanceMeters`
- `route.distanceMeters` no response da API pode ser a soma das distâncias dos transitions, não o total da rota
- O campo `travelDistanceMeters` pode não existir na resposta atual da API

### 3. Rotas criadas manualmente não têm distância calculada
- `delivery.routes.create` insere routeOrders sem `distanceFromPrevious` e sem `totalDistance`
- `reorderOrders` apenas atualiza position, sem recalcular distâncias

### 4. Fallback local usa conversão aproximada (graus para metros)
- Multiplica por 111000, que é apenas uma aproximação grosseira
- Não considera a curvatura da Terra nem o caminho real pelas ruas

## Soluções Propostas

### Para balanceamento:
1. Usar Distance Matrix API do Google para calcular distâncias reais entre pares de pontos
2. Implementar algoritmo de balanceamento que minimiza a diferença de KM total entre rotas
3. Considerar não apenas a proximidade, mas também o número de paradas e o KM total

### Para cálculo de KM:
1. Usar Distance Matrix API para calcular distância real de cada trecho
2. Salvar `distanceFromPrevious` correto em cada routeOrder
3. Calcular `totalDistance` como soma dos trechos
4. Implementar endpoint para recalcular distâncias de rotas existentes

### Para rotas manuais:
1. Ao criar rota manual, calcular distâncias via API
2. Ao reordenar, recalcular todas as distâncias
