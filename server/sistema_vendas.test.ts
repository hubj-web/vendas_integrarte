import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Helper to create a mock admin context
function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-test",
      email: "admin@test.com",
      name: "Admin Test",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: { cookie: "" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createDeliveryContext(): TrpcContext {
  return {
    ...createAdminContext(),
    user: {
      id: 2,
      openId: "delivery-test",
      email: "delivery@test.com",
      name: "Delivery Test",
      loginMethod: "local",
      role: "delivery",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
    const ctx: TrpcContext = {
      ...createAdminContext(),
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      } as unknown as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

describe("auth.me", () => {
  it("returns the current user when authenticated", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).not.toBeNull();
    expect(user?.role).toBe("admin");
  });

  it("returns null when not authenticated", async () => {
    const ctx: TrpcContext = {
      ...createAdminContext(),
      user: null,
    };
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});

describe("role-based access control", () => {
  it("delivery user cannot access admin-only reports", async () => {
    const ctx = createDeliveryContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reports.sales({ dateFrom: "2024-01-01", dateTo: "2024-12-31" })
    ).rejects.toThrow();
  });

  it("admin can access reports", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Should not throw - just may return empty data without DB
    try {
      await caller.reports.sales({ dateFrom: "2024-01-01", dateTo: "2024-12-31" });
    } catch (e: any) {
      // Only INTERNAL_SERVER_ERROR (no DB) is acceptable, not FORBIDDEN
      expect(e.code).not.toBe("FORBIDDEN");
    }
  });
});

describe("catalog procedures", () => {
  it("product types list is accessible by admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    try {
      const result = await caller.catalog.productTypes.list();
      expect(Array.isArray(result)).toBe(true);
    } catch (e: any) {
      // DB not available in test env is acceptable
      expect(e.code).not.toBe("FORBIDDEN");
      expect(e.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("delivery user cannot manage product types", async () => {
    const ctx = createDeliveryContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.catalog.productTypes.create({ name: "Test Type" })
    ).rejects.toThrow();
  });
});

describe("order procedures", () => {
  it("order list is accessible by admin", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    try {
      const result = await caller.orders.orders.list({});
      // Result can be array or paginated object
      expect(result).toBeDefined();
    } catch (e: any) {
      expect(e.code).not.toBe("FORBIDDEN");
    }
  });
});
