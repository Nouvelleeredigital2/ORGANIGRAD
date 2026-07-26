// Surface d'émission DÉCLARÉE d'Organigrad sur le bus Synapse — module SANS
// dépendance. Doit rester ⊆ du registre partagé pour le slug "organigrad"
// (@apps2026/contracts → APP_EMIT_REGISTRY), vérifié par le self-test.
//   - validation.requested : émis quand un nœud HUMAN est atteint (→ LINK) ;
//   - validation.approved / rejected : décision rejouée sur le bus (producer.ts).
export const EMITTED_EVENT_TYPES = [
  "validation.requested",
  "validation.approved",
  "validation.rejected",
] as const;
