import type { Deployer } from "./deployers/types.js";

export interface PlatformChoiceInput {
  preferred?: string;
  existing?: string;
  sessionChoice?: string;
  available: Deployer[];
}

export type PlatformChoice =
  | { kind: "use"; deployer: Deployer }
  | { kind: "ask"; options: Deployer[] }
  | { kind: "unavailable" };

/**
 * Decide which deployer to use, or whether the user must be asked.
 * Pure: no side effects, no UI. The caller drives ctx.ui.select for "ask".
 */
export function resolvePlatformChoice(input: PlatformChoiceInput): PlatformChoice {
  const { preferred, existing, sessionChoice, available } = input;

  if (preferred) {
    const d = available.find((d) => d.name === preferred);
    return d ? { kind: "use", deployer: d } : { kind: "unavailable" };
  }

  if (existing) {
    const d = available.find((d) => d.name === existing) ?? available[0];
    return d ? { kind: "use", deployer: d } : { kind: "ask", options: available };
  }

  if (sessionChoice) {
    const d = available.find((d) => d.name === sessionChoice);
    if (d) return { kind: "use", deployer: d };
  }

  if (available.length <= 1) {
    return available[0] ? { kind: "use", deployer: available[0] } : { kind: "ask", options: available };
  }

  return { kind: "ask", options: available };
}