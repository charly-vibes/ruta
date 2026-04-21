// ---------------------------------------------------------------------------
// Pure helpers for the /ruta-disagree workflow
// ---------------------------------------------------------------------------

interface ModelLike {
  id: string;
  provider: string;
}

/**
 * Pick the secondary model. Preference order:
 *   1. The configured secondary model ID, if present in available and different from primary
 *   2. First available model from a different provider than the primary
 * Returns null when no secondary can be found.
 */
export function selectSecondaryModel<T extends ModelLike>(
  available: T[],
  primary: T,
  secondaryModelId: string | undefined,
): T | null {
  if (secondaryModelId) {
    const configured = available.find((m) => m.id === secondaryModelId && m.id !== primary.id);
    if (configured) return configured;
  }
  return available.find((m) => m.provider !== primary.provider) ?? null;
}

/**
 * Simple word-overlap heuristic.
 * Returns true when the Jaccard similarity of word sets is below the
 * DISAGREEMENT_THRESHOLD, i.e. the two texts share few words.
 *
 * 0.45 was calibrated against sample response pairs: texts with mostly shared
 * vocabulary (paraphrases) score ≥0.50; clearly divergent answers score ≤0.30.
 * A threshold of 0.45 catches meaningful divergence while tolerating rewording.
 */
const DISAGREEMENT_THRESHOLD = 0.45;

export function detectDisagreement(primary: string, secondary: string): boolean {
  // No data is not a disagreement signal
  if (!primary.trim() || !secondary.trim()) return false;

  const words = (text: string): Set<string> =>
    new Set(text.toLowerCase().match(/\b\w+\b/g) ?? []);

  const a = words(primary);
  const b = words(secondary);
  const intersection = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  if (union === 0) return false;
  return intersection / union < DISAGREEMENT_THRESHOLD;
}

export interface DisagreementReportOptions {
  primary: string;
  secondary: string;
  primaryId: string;
  secondaryId: string;
  disagrees: boolean;
  section?: string;
}

/**
 * Build a structured comparison report.
 * When models disagree, flags the divergence and suggests a gap probe.
 * When they agree, reminds that agreement is not evidence of spec clarity.
 */
export function formatDisagreementReport(opts: DisagreementReportOptions): string {
  const { primary, secondary, primaryId, secondaryId, disagrees, section } = opts;

  const header = disagrees
    ? [
        "## DISAGREEMENT DETECTED",
        "",
        "The two models give materially different responses. This is a signal worth probing.",
        section
          ? `Run \`/ruta-probe ${section}\` or use \`ruta_gap_probe\` on the relevant section to surface the underlying spec gap.`
          : "Run `/ruta-probe <section>` or use `ruta_gap_probe` to surface the underlying spec gap.",
        "",
      ]
    : [
        "## Agreement",
        "",
        "Both models gave similar responses.",
        "Note: agreement between models is not evidence of spec clarity — both may share the same bias toward plausible-sounding defaults.",
        "",
      ];

  return [
    "# ruta disagree",
    "",
    ...header,
    `## Primary (${primaryId})`,
    "",
    primary || "(no prior response)",
    "",
    `## Secondary (${secondaryId})`,
    "",
    secondary,
    "",
  ].join("\n");
}
