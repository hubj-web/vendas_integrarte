import { ENV } from "./_core/env";

/**
 * Cliente para a Google Maps Route Optimization API
 * Resolve o Vehicle Routing Problem (VRP) para múltiplos entregadores
 */

interface Location {
  latitude: number;
  longitude: number;
}

interface Shipment {
  pickups?: Array<{
    location: Location;
    timeWindows?: Array<{ startTime: string; endTime: string }>;
  }>;
  deliveries?: Array<{
    location: Location;
    timeWindows?: Array<{ startTime: string; endTime: string }>;
  }>;
}

interface Vehicle {
  displayName: string;
  startLocation: Location;
  endLocation?: Location;
  costPerKilometer?: number;
  costPerHour?: number;
  startTime?: string;
  endTime?: string;
}

interface OptimizationRequest {
  parent: string;
  body: {
    model: {
      shipments: Array<Shipment & { label: string }>;
      vehicles: Array<Vehicle & { displayName: string }>;
      routeModifiers?: {
        routeStrategy?: "DEFAULT_ROUTE_STRATEGY" | "MINIMIZE_ROUTE_COUNT";
      };
    };
    routingPreference?: "TRAFFIC_UNAWARE" | "TRAFFIC_AWARE";
  };
}

interface OptimizedRoute {
  vehicleIndex: number;
  visits: Array<{
    shipmentIndex: number;
    isPickup: boolean;
    startTime: string;
    detourTime: string;
    distanceMeters: number;
  }>;
  metrics: {
    usedCapacity: Record<string, number>;
    breakDuration: string;
    travelDuration: string;
    waitDuration: string;
    serviceTime: string;
    totalTime: string;
    travelDistanceMeters: number;
  };
}

interface OptimizationResponse {
  routes: OptimizedRoute[];
  routeModifiers?: {
    routeStrategy?: string;
  };
  skippedShipments: Array<{ index: number; reasons: string[] }>;
}

export const googleMapsClient = {
  isConfigured(): boolean {
    return !!ENV.googleMapsApiKey && !!ENV.googleCloudProjectId;
  },

  /**
   * Otimiza rotas para múltiplos entregadores usando a Google Maps Route Optimization API
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
  ): Promise<OptimizationResponse | null> {
    if (!this.isConfigured()) {
      console.warn("[Google Maps] API não configurada. Configure GOOGLE_MAPS_API_KEY e GOOGLE_CLOUD_PROJECT_ID.");
      return null;
    }

    try {
      const request: OptimizationRequest = {
        parent: `projects/${ENV.googleCloudProjectId}`,
        body: {
          model: {
            shipments: shipments.map((s) => ({
              label: s.label,
              deliveries: [
                {
                  location: s.location,
                  timeWindows: [
                    {
                      startTime: "2026-01-01T08:00:00Z",
                      endTime: "2026-01-01T20:00:00Z",
                    },
                  ],
                },
              ],
            })),
            vehicles: vehicles.map((v) => ({
              displayName: v.displayName,
              startLocation: v.startLocation,
              endLocation: v.endLocation || v.startLocation,
              costPerKilometer: 1,
              costPerHour: 10,
              startTime: "2026-01-01T08:00:00Z",
              endTime: "2026-01-01T20:00:00Z",
            })),
            routeModifiers: {
              routeStrategy: options?.routeStrategy || "DEFAULT_ROUTE_STRATEGY",
            },
          },
          routingPreference: options?.trafficAware ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
        },
      };

      const url = `https://routeoptimization.googleapis.com/v1/${request.parent}:optimizeTours`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": ENV.googleMapsApiKey,
        },
        body: JSON.stringify(request.body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorText;
        } catch (e) {}
        
        console.error("[Google Maps] Erro na otimização:", errorMessage);
        // Retornamos o erro para ser capturado no router
        throw new Error(`Google Maps API Error: ${errorMessage}`);
      }

      const data = (await response.json()) as OptimizationResponse;
      return data;
    } catch (error) {
      console.error("[Google Maps] Erro ao chamar API:", error);
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
      const url = new URL("https://routes.googleapis.com/distancematrix/v2:computeRouteMatrix");
      url.searchParams.append("key", ENV.googleMapsApiKey);

      const body = {
        origins: [{ latitude: origin.latitude, longitude: origin.longitude }],
        destinations: [{ latitude: destination.latitude, longitude: destination.longitude }],
        travelMode: "DRIVE",
      };

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as any;
      if (data.rows?.[0]?.elements?.[0]) {
        const element = data.rows[0].elements[0];
        return {
          distanceMeters: element.distanceMeters || 0,
          durationSeconds: element.duration?.seconds || 0,
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
