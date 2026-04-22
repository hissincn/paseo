import { describe, expect, it } from "vitest";

import {
  filterImportableSessionsForWorkspace,
  getImportableSessionProviderLabel,
  groupImportableSessionsByProvider,
  sortImportableSessions,
} from "./importable-sessions-utils";

describe("use-importable-sessions helpers", () => {
  const entries = [
    {
      provider: "codex",
      sessionId: "codex-1",
      cwd: "/tmp/codex",
      title: "Codex",
      lastActivityAt: "2026-04-12T03:00:00.000Z",
      persistence: { provider: "codex", sessionId: "codex-1" },
    },
    {
      provider: "claude",
      sessionId: "claude-1",
      cwd: "/tmp/claude",
      title: "Claude",
      lastActivityAt: "2026-04-12T05:00:00.000Z",
      persistence: { provider: "claude", sessionId: "claude-1" },
    },
    {
      provider: "codex",
      sessionId: "codex-2",
      cwd: "/tmp/codex-2",
      title: "Codex 2",
      lastActivityAt: "2026-04-12T04:00:00.000Z",
      persistence: { provider: "codex", sessionId: "codex-2" },
    },
  ] as const;

  it("sorts importable sessions by most recent activity first", () => {
    expect(sortImportableSessions(entries).map((entry) => entry.sessionId)).toEqual([
      "claude-1",
      "codex-2",
      "codex-1",
    ]);
  });

  it("groups importable sessions by provider after sorting", () => {
    expect(groupImportableSessionsByProvider(entries)).toEqual([
      {
        provider: "claude",
        entries: [expect.objectContaining({ sessionId: "claude-1" })],
      },
      {
        provider: "codex",
        entries: [
          expect.objectContaining({ sessionId: "codex-2" }),
          expect.objectContaining({ sessionId: "codex-1" }),
        ],
      },
    ]);
  });

  it("filters sessions to the current workspace only", () => {
    expect(filterImportableSessionsForWorkspace(entries, "/tmp/codex-2/")).toEqual([
      expect.objectContaining({ sessionId: "codex-2" }),
    ]);
    expect(filterImportableSessionsForWorkspace(entries, "/tmp/missing")).toEqual([]);
  });

  it("returns humanized provider labels when known", () => {
    expect(getImportableSessionProviderLabel("claude")).toBe("Claude");
    expect(getImportableSessionProviderLabel("unknown-provider")).toBe("unknown-provider");
  });
});
