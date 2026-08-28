import { describe, expect, it } from "vitest";
import { requireRole, type CurrentSession } from "@/lib/auth/session";

function sessionWithRole(role: CurrentSession["profile"]["role"]): CurrentSession {
  return {
    userId: "u1",
    email: "u1@example.com",
    profile: {
      id: "u1",
      company_id: "c1",
      full_name: "Test User",
      role,
      phone: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    company: {
      id: "c1",
      name: "Test Co",
      legal_name: null,
      logo_url: null,
      ice: null,
      if_number: null,
      rc: null,
      address: null,
      city: null,
      country: "Morocco",
      phone: null,
      email: null,
      currency: "MAD",
      vat_rate: 20,
      minimum_margin_percent: 15,
      auto_approval_limit: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

describe("requireRole (quotation approval authorization)", () => {
  it("allows an admin to approve", () => {
    expect(() => requireRole(sessionWithRole("admin"), ["admin", "manager"])).not.toThrow();
  });

  it("allows a manager to approve", () => {
    expect(() => requireRole(sessionWithRole("manager"), ["admin", "manager"])).not.toThrow();
  });

  it("blocks a salesperson from approving a quotation", () => {
    expect(() => requireRole(sessionWithRole("salesperson"), ["admin", "manager"])).toThrow(/FORBIDDEN/);
  });
});
