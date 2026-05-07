import { getAllEffectiveRoles, getImpliedRoles, ROLE_HIERARCHY } from "@/lib/entitlements/role-hierarchy.config";

describe("role-hierarchy", () => {
  describe("getImpliedRoles", () => {
    it("Premium implies Base", () => {
      expect(getImpliedRoles("Premium Access")).toEqual(["Base Access"]);
    });

    it("Enterprise implies Premium and Base", () => {
      expect(getImpliedRoles("Enterprise Access")).toEqual(["Premium Access", "Base Access"]);
    });

    it("Base implies nothing", () => {
      expect(getImpliedRoles("Base Access")).toEqual([]);
    });

    it("unknown role implies nothing", () => {
      expect(getImpliedRoles("Nonexistent")).toEqual([]);
    });
  });

  describe("getAllEffectiveRoles", () => {
    it("expands Premium to include Base", () => {
      const result = getAllEffectiveRoles(["Premium Access"]);
      expect(result).toContain("Premium Access");
      expect(result).toContain("Base Access");
      expect(result).toHaveLength(2);
    });

    it("expands Enterprise to include Premium and Base", () => {
      const result = getAllEffectiveRoles(["Enterprise Access"]);
      expect(result).toContain("Enterprise Access");
      expect(result).toContain("Premium Access");
      expect(result).toContain("Base Access");
      expect(result).toHaveLength(3);
    });

    it("does not duplicate when user has both Premium and Base explicitly", () => {
      const result = getAllEffectiveRoles(["Premium Access", "Base Access"]);
      expect(result).toContain("Premium Access");
      expect(result).toContain("Base Access");
      expect(result).toHaveLength(2);
    });

    it("returns Base only for Base-only user", () => {
      const result = getAllEffectiveRoles(["Base Access"]);
      expect(result).toEqual(["Base Access"]);
    });

    it("passes through non-sellable roles unchanged", () => {
      const result = getAllEffectiveRoles(["Premium Access", "addon:managing_companies:+2"]);
      expect(result).toContain("Premium Access");
      expect(result).toContain("Base Access");
      expect(result).toContain("addon:managing_companies:+2");
      expect(result).toHaveLength(3);
    });

    it("returns empty for empty input", () => {
      expect(getAllEffectiveRoles([])).toEqual([]);
    });
  });
});
