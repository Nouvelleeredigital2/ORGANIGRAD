// Self-test d'émission Synapse — Organigrad garde son émetteur honnête dans sa CI :
// chaque type de EMITTED_EVENT_TYPES doit être déclaré pour "organigrad" dans le
// registre partagé (@apps2026/contracts → APP_EMIT_REGISTRY). Sinon le hub le
// rejetterait en prod (SYNAPSE_REGISTRY_ENFORCEMENT=enforce).
import { describe, it, expect } from "vitest";
import { isEmissionDeclared, APP_EMIT_REGISTRY } from "@apps2026/contracts";
import { EMITTED_EVENT_TYPES } from "../src/synapse/synapseEmittedTypes.js";

const SLUG = "organigrad";

describe("émissions Organigrad ⊆ registre partagé", () => {
  it("le slug est connu du registre", () => {
    expect(Object.keys(APP_EMIT_REGISTRY)).toContain(SLUG);
  });

  it.each([...EMITTED_EVENT_TYPES])("%s est déclaré", (type) => {
    expect(isEmissionDeclared(SLUG, type), `type "${type}" non déclaré au registre`).toBe(true);
  });
});
