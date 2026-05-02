import { Badge } from "@/components/ui/badge";

export interface SourceBadgeProps {
  source: string;
}

/**
 * Manual vs synced visual distinction (D-29, MAN-05).
 *
 * Phase 2: only "manual" exists; render a neutral "Manual" badge so the user
 * can visually distinguish hand-entered rows from future PSD2-synced rows.
 * Phase 4 will add bank-name variants for source='psd2'.
 */
export function SourceBadge({ source }: SourceBadgeProps) {
  if (source === "manual") {
    return (
      <Badge variant="secondary" className="text-xs">
        Manual
      </Badge>
    );
  }
  // Phase 4 addition: distinct badge for source='psd2' (bank-name variant).
  return null;
}
