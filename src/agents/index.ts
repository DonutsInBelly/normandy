import { AgentRegistry } from "./registry.js";
import { shepardConfig, createShepardAgent } from "./supervisor.js";
import {
  taliConfig, createTaliAgent,
  garrusConfig, createGarrusAgent,
  liaraConfig, createLiaraAgent,
  mirandaConfig, createMirandaAgent,
  mordinConfig, createMordinAgent,
  kasumiConfig, createKasumiAgent,
  samaraConfig, createSamaraAgent,
  ediConfig, createEDIAgent,
  thaneConfig, createThaneAgent,
  legionConfig, createLegionAgent,
  javikConfig, createJavikAgent,
} from "./specialists/index.js";

export function createDefaultRegistry(): AgentRegistry {
  const registry = new AgentRegistry();

  registry.register(shepardConfig, createShepardAgent);
  registry.register(taliConfig, createTaliAgent);
  registry.register(garrusConfig, createGarrusAgent);
  registry.register(liaraConfig, createLiaraAgent);
  registry.register(mirandaConfig, createMirandaAgent);
  registry.register(mordinConfig, createMordinAgent);
  registry.register(kasumiConfig, createKasumiAgent);
  registry.register(samaraConfig, createSamaraAgent);
  registry.register(ediConfig, createEDIAgent);
  registry.register(thaneConfig, createThaneAgent);
  registry.register(legionConfig, createLegionAgent);
  registry.register(javikConfig, createJavikAgent);

  return registry;
}

export { AgentRegistry } from "./registry.js";
export { ShepardAgent, shepardConfig } from "./supervisor.js";
