// Stage B no longer calls Parallel or an LLM. Clay returns buying situations
// together with seller research. FindAll objectives and match conditions are
// synthesized in clay-map.ts because the routine does not emit them.

export { mapClayIntelligence, parseEmployeeRange, type SellerIntelligence } from "./clay-map";
