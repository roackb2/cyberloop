// State is a type alias for unknown in core, so we don't extend it directly in the interface
// but we ensure WikiState is compatible where needed.

export interface WikiState {
  currentTitle: string;
  summary: string;       // First paragraph for embedding
  url: string;
  goal: string;          // The target concept (e.g., "Microprocessors")
  history: string[];     // List of visited titles
  depth: number;
  // Available links for next move
  links: string[];
}

export type WikiAction =
  | { type: 'NAVIGATE'; title: string }
  | { type: 'DONE'; result: string }
  | { type: 'CORRECTION'; vector: number[]; magnitude: number; log: string }; // From v2.1 Core

export interface WikiResponse {
  query?: {
    pages?: Record<string, {
      title: string;
      extract?: string;
      links?: { title: string }[];
    }>
  }
}
