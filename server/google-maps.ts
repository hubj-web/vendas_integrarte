import { ENV } from "./_core/env";

/**
 * Cliente para a Google Maps Route Optimization API
 * Resolve o Vehicle Routing Problem (VRP) para múltiplos entregadores
 * 
 * Estrutura do request baseada na documentação oficial:
 * https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects/optimizeTours
 */

interface Location {
  latitude: number;
  longitude: number;
}

interface Shipment {
  label: string;
  deliveries: Array<{
    arrivalWaypoint: {
      location: {
        latLng: {
          latitude: number;
          longitude: number;
        };
      };
    };
    timeWindows?: Array<{ startTime: string; endTime: string }>;
  }>;
}

interface Vehicle {
  displayName: string;
  startWaypoint: {
    location: {
      latLng: {
        latitude: number;
        longitude: number;
      };
    };
  };
  endWaypoint: {
    location: {
      latLng: {
        latitude: number;
        longitude: number;
      };
    };
  };
  costPerHour?: number;
  startTimeWindows?: Array<{ startTime: string; endTime: string }>;
  endTimeWindows?: Array<{ startTime: string; endTime: string }>;
}

interface OptimizeToursRequest {
  timeout: string;
  model: {
    shipments: Array<Shipment>;
    vehicles: Array<Vehicle>;
    globalStartTime?: string;
    globalEndTime?: string;
  };
  considerRoadTraffic?: boolean;
  populatePolylines?: boolean;
}

interface Visit {
  shipmentIndex: number;
  isPickup: boolean;
  startTime: string;
  detourTime: string;
  distanceMeters: number;
}

interface ShipmentRoute {
  vehicleIndex: number;
  visits: Array<Visit>;
  transitions: Array<{
    travelDuration: string;
    distanceMeters: number;
  }>;
  travelDuration: string;
  totalDuration: string;
  distanceMeters: number;
}

interface OptimizeToursResponse {
  routes: Array<ShipmentRoute>;
  skippedShipments?: Array<{ index: number; label?: string; reasons: string[] }>;
}

export const googleMapsClient = {
  isConfigured(): boolean {
    const hasKey = !!ENV.googleMapsApiKey;
    const hasProjectId = !!ENV.googleCloudProjectId;
    
    if (!hasKey || !hasProjectId) {
      console.warn(
        "[Google Maps] Configuração incompleta:",
        {
          hasApiKey: hasKey ? "✓ configurada" : "✗ FALTANDO",
          hasProjectId: hasProjectId ? "✓ configurada" : "✗ FALTANDO",
          apiKeyLength: ENV.googleMapsApiKey?.length || 0,
          projectIdLength: ENV.googleCloudProjectId?.length || 0,
        }
      );
    }
    
    return hasKey && hasProjectId;
  },

  /**
   * Converte um endereço em texto para coordenadas usando a Geocoding API
   */
  async geocode(address: string): Promise<Location | null> {
    if (!this.isConfigured()) return null;
    
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.append("address", address);
      url.searchParams.append("key", ENV.googleMapsApiKey);
      
      const response = await fetch(url.toString());
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data.status === "OK" && data.results?.[0]?.geometry?.location) {
        const loc = data.results[0].geometry.location;
        return {
          latitude: loc.lat,
          longitude: loc.lng
        };
      }
      console.warn(`[Google Maps] Geocodificação falhou para: "${address}". Status: ${data.status}`);
      return null;
    } catch (error) {
      console.error("[Google Maps] Erro na geocodificação:", error);
      return null;
    }
  },

  /**
   * Otimiza rotas para múltiplos entregadores usando a Google Maps Route Optimization API
   * 
   * A estrutura do request segue a documentação oficial:
   * - Shipments usam `arrivalWaypoint.location.latLng` para as coordenadas
   * - Vehicles usam `startWaypoint` e `endWaypoint` com estrutura `location.latLng`
   * - `considerRoadTraffic` (boolean) ao invés de `routingPreference`
   * - `globalStartTime`/`globalEndTime` definem o timeframe global
   * - `timeout` controla o tempo máximo de espera
   */
  async optimizeRoutes(
    shipments: Array<{
      id: number;
      location: Location;
      label: string;
    }>,
    vehicles: Array<{
      id: number;
      displayName: string;
      startLocation: Location;
      endLocation?: Location;
    }>,
    options?: {
      routeStrategy?: "DEFAULT_ROUTE_STRATEGY" | "MINIMIZE_ROUTE_COUNT";
      trafficAware?: boolean;
    }
  ): Promise<OptimizeToursResponse | null> {
    if (!this.isConfigured()) {
      console.warn("[Google Maps] API não configurada. Configure GOOGLE_MAPS_API_KEY e GOOGLE_CLOUD_PROJECT_ID.");
      return null;
    }

    // Gerar timestamp para hoje com a data atual
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const globalStartTime = `${todayStr}T06:00:00Z`;
    const globalEndTime = `${todayStr}T23:00:00Z`;

    try {
      const request: OptimizeToursRequest = {
        timeout: "60s",
        model: {
          shipments: shipments.map((s) => ({
            label: s.label,
            deliveries: [
              {
                arrivalWaypoint: {
                  location: {
                    latLng: {
                      latitude: s.location.latitude,
                      longitude: s.location.longitude,
                    },
                  },
                },
                timeWindows: [
                  {
                    startTime: `${todayStr}T08:00:00Z`,
                    endTime: `${todayStr}T20:00:00Z`,
                  },
                ],
              },
            ],
          })),
          vehicles: vehicles.map((v) => ({
            displayName: v.displayName,
            startWaypoint: {
              location: {
                latLng: {
                  latitude: v.startLocation.latitude,
                  longitude: v.startLocation.longitude,
                },
              },
            },
            endWaypoint: {
              location: {
                latLng: {
                  latitude: (v.endLocation || v.startLocation).latitude,
                  longitude: (v.endLocation || v.startLocation).longitude,
                },
              },
            },
            costPerHour: 10,
            startTimeWindows: [
              {
                startTime: `${todayStr}T06:00:00Z`,
                endTime: `${todayStr}T10:00:00Z`,
              },
            ],
            endTimeWindows: [
              {
                startTime: `${todayStr}T18:00:00Z`,
                endTime: `${todayStr}T23:00:00Z`,
              },
            ],
          })),
          globalStartTime,
          globalEndTime,
        },
        considerRoadTraffic: options?.trafficAware ?? false,
        populatePolylines: false,
      };

      const url = `https://routeoptimization.googleapis.com/v1/projects/${ENV.googleCloudProjectId}:optimizeTours`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": ENV.googleMapsApiKey,
        },
        body: JSON.stringify(request),
      });

      const errorText = await response.text();

      if (!response.ok) {
        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorText;
          console.error("[Google Maps] Erro da API - Detalhes:", {
            status: response.status,
            message: errorMessage,
            details: errorJson.error?.details || "Nenhum detalhe",
          });
        } catch (e) {}
        
        throw new Error(`Google Maps API Error (${response.status}): ${errorMessage}`);
      }

      try {
        const data = JSON.parse(errorText) as OptimizeToursResponse;
        
        // Logar informações úteis para debugging
        if (data.skippedShipments && data.skippedShipments.length > 0) {
          console.warn(
            `[Google Maps] ${data.skippedShipments.length} shipment(s) foram ignorados:`,
            data.skippedShipments.map((s) => `#${s.index} (${s.label || "sem label"}): ${s.reasons?.join(", ") || "sem motivo"}`).join("; ")
          );
        }
        
        console.log(
          `[Google Maps] Otimização concluída: ${data.routes?.length || 0} rota(s) gerada(s)`
        );
        
        return data;
      } catch (parseError) {
        console.error("[Google Maps] Erro ao parsear resposta da API:", parseError);
        console.error("[Google Maps] Resposta recebida:", errorText.substring(0, 500));
        return null;
      }
    } catch (error) {
      console.error("[Google Maps] Erro ao chamar API de otimização:", error);
      throw error;
    }
  },

  /**
   * Calcula a matriz de distância entre múltiplos pares de origens e destinos
   * usando a Distance Matrix API.
   * 
   * @param origins - String de origens no formato "lat,lng|lat,lng|..."
   * @param destinations - String de destinos no formato "lat,lng|lat,lng|..."
   * @returns Objeto com rows contendo elementos de distância para cada par origem-destino
   */
  async getDistanceMatrix(
    origins: string,
    destinations: string
  ): Promise<{
    rows: Array<{
      elements: Array<{
        status: string;
        distance?: { value: number; text: string };
        duration?: { value: number; text: string };
      }>;
    }>;
  } | null> {
    if (!this.isConfigured()) return null;

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.append("origins", origins);
      url.searchParams.append("destinations", destinations);
      url.searchParams.append("key", ENV.googleMapsApiKey);
      url.searchParams.append("mode", "driving");

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const data = await response.json();
      
      if (data.status === "OK" && data.rows?.length > 0) {
        return data;
      }
      
      console.warn(`[DistanceMatrix] Status da API: ${data.status}, error: ${data.error_message}`);
      return null;
    } catch (error) {
      console.error("[DistanceMatrix] Erro ao calcular matriz:", error);
      return null;
    }
  },

  /**
   * Calcula a distância e tempo entre dois pontos usando a Distance Matrix API
   */
  async getDistance(
    origin: Location,
    destination: Location
  ): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    if (!this.isConfigured()) return null;

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.append("origins", `${origin.latitude},${origin.longitude}`);
      url.searchParams.append("destinations", `${destination.latitude},${destination.longitude}`);
      url.searchParams.append("key", ENV.googleMapsApiKey);
      url.searchParams.append("mode", "driving");

      const response = await fetch(url.toString());
      if (!response.ok) return null;

      const data = await response.json();
      if (data.rows?.[0]?.elements?.[0]?.status === "OK") {
        const element = data.rows[0].elements[0];
        return {
          distanceMeters: element.distance?.value || 0,
          durationSeconds: element.duration?.value || 0,
        };
      }
      return null;
    } catch (error) {
      console.error("[Google Maps] Erro ao calcular distância:", error);
      return null;
    }
  },

  /**
   * Otimiza a ordem de paradas para um único veículo usando a Routes API
   */
  async optimizeWaypoints(
    origin: Location,
    destination: Location,
    waypoints: Array<{ location: Location; label: string }>
  ): Promise<{ optimizedOrder: number[] } | null> {
    if (!this.isConfigured()) return null;

    try {
      const url = "https://routes.googleapis.com/directions/v2:computeRoutes";

      const body = {
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        intermediates: waypoints.map((w) => ({
          location: { latLng: { latitude: w.location.latitude, longitude: w.location.longitude } },
        })),
        travelMode: "DRIVE",
        optimizeWaypointOrder: true,
        routingPreference: "TRAFFIC_UNAWARE",
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": ENV.googleMapsApiKey,
          "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as any;
      if (data.routes?.[0]?.optimizedIntermediateWaypointIndex) {
        return {
          optimizedOrder: data.routes[0].optimizedIntermediateWaypointIndex,
        };
      }
      return null;
    } catch (error) {
      console.error("[Google Maps] Erro ao otimizar waypoints:", error);
      return null;
    }
  },
};
