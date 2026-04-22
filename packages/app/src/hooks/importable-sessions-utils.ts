import type { ImportableSessionEntry } from "@server/client/daemon-client";
import { normalizeWorkspaceIdentity } from "../utils/workspace-identity";

const PROVIDER_LABELS = new Map<string, string>(
  [
    ["claude", "Claude"],
    ["codex", "Codex"],
    ["opencode", "OpenCode"],
    ["acp", "ACP"],
  ] as const,
);

export function sortImportableSessions(
  entries: readonly ImportableSessionEntry[],
): ImportableSessionEntry[] {
  return [...entries].sort(
    (left, right) =>
      new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime(),
  );
}

export function groupImportableSessionsByProvider(
  entries: readonly ImportableSessionEntry[],
): Array<{ provider: string; entries: ImportableSessionEntry[] }> {
  const groups = new Map<string, ImportableSessionEntry[]>();
  for (const entry of sortImportableSessions(entries)) {
    const existing = groups.get(entry.provider) ?? [];
    existing.push(entry);
    groups.set(entry.provider, existing);
  }
  return Array.from(groups.entries()).map(([provider, providerEntries]) => ({
    provider,
    entries: providerEntries,
  }));
}

export function filterImportableSessionsForWorkspace(
  entries: readonly ImportableSessionEntry[],
  workspaceId: string | null | undefined,
): ImportableSessionEntry[] {
  const normalizedWorkspaceId = normalizeWorkspaceIdentity(workspaceId) ?? "";
  if (!normalizedWorkspaceId) {
    return [];
  }

  return entries.filter(
    (entry) => normalizeWorkspaceIdentity(entry.cwd) === normalizedWorkspaceId,
  );
}

export function getImportableSessionProviderLabel(provider: string): string {
  return PROVIDER_LABELS.get(provider) ?? provider;
}
