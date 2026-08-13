/**
 * Regression: Prescriptions (audit B9) must be reachable through the full
 * portal navigation but must NOT appear in the 5-item mobile bottom bar,
 * and the mobile bar's original five items must stay unchanged and in the
 * same order — an earlier attempt at this inserted Prescriptions at index 4,
 * which silently displaced "Payments" out of the mobile bar's
 * `NAV_ITEMS.slice(0, 5)` window.
 *
 * Lives under lib/__tests__ (not next to the component) because this
 * project's test runner only discovers specs under business-brain/, lib/,
 * app/, and actions/ — not components/.
 */

import { describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/components/layouts/PortalNav";

const MOBILE_TAB_COUNT = 5;

describe("PortalNav (audit B9)", () => {
  it("includes Prescriptions in the full navigation", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toContain("Prescriptions");
    expect(NAV_ITEMS.find((i) => i.label === "Prescriptions")?.href).toBe("/portal/prescriptions");
  });

  it("does NOT include Prescriptions in the 5-item mobile bottom bar", () => {
    const mobileItems = NAV_ITEMS.slice(0, MOBILE_TAB_COUNT);
    expect(mobileItems.map((i) => i.label)).not.toContain("Prescriptions");
  });

  it("keeps the original five mobile tabs unchanged and in order", () => {
    const mobileItems = NAV_ITEMS.slice(0, MOBILE_TAB_COUNT);
    expect(mobileItems.map((i) => i.label)).toEqual([
      "Home",
      "Appointments",
      "Queue",
      "Treatments",
      "Payments",
    ]);
  });

  it("does not remove or reorder any pre-existing item, and adds exactly one new item", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    expect(labels).toEqual([
      "Home",
      "Appointments",
      "Queue",
      "Treatments",
      "Payments",
      "Prescriptions",
      "Follow-Ups",
      "Profile",
    ]);
  });
});
