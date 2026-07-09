# Diferenças entre Implementação Atual e API Oficial

## Estrutura do Request Body

### Atual (incorreta):
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

### Correta (API oficial):
```json
{
  "timeout": "30s",
  "model": {
    "shipments": [
      {
        "label": "...",
        "deliveries": [
          {
            "arrivalWaypoint": {
              "location": {
                "latLng": {
                  "latitude": -18.9186,
                  "longitude": -48.2772
                }
              }
            },
            "timeWindows": [...]
          }
        ]
      }
    ],
    "vehicles": [
      {
        "startWaypoint": {
          "location": {
            "latLng": {
              "latitude": -18.9186,
              "longitude": -48.2772
            }
          }
        },
        "endWaypoint": {...},
        "costPerHour": 10,
        "startTimeWindows": [...],
        "endTimeWindows": [...]
      }
    ],
    "globalStartTime": "2026-07-08T08:00:00Z",
    "globalEndTime": "2026-07-08T20:00:00Z"
  },
  "considerRoadTraffic": true,
  "populatePolylines": false
}
```

## Principais Erros Identificados:

1. **location vs arrivalWaypoint**: O código usa `location` diretamente, mas a API espera `arrivalWaypoint.location.latLng`
2. **startLocation/endLocation vs startWaypoint/endWaypoint**: Vehicles usam `startWaypoint` e `endWaypoint`, não `startLocation`/`endLocation`
3. **routingPreference vs considerRoadTraffic**: O campo correto é `considerRoadTraffic` (boolean), não `routingPreference`
4. **RouteModifiers no local errado**: `routeModifiers` existe mas é um campo do ShipmentModel, não dentro de model separadamente. Na verdade, a estrutura correta para estratégia de rota é diferente.
5. **Falta de globalStartTime/globalEndTime**: A API precisa de um timeframe global
6. **costPerKilometer não é válido**: Não existe esse campo na API. Existe `costPerHour` e `costPerUnperformedShipment`.
