import { describe, expect, test, vi } from "vitest";

vi.mock("@isaacs/ttlcache", () => ({
  TTLCache: class TTLCache<K, V> {
    #values = new Map<K, V>();

    clear() {
      this.#values.clear();
    }

    cancelTimer() {}

    get(key: K) {
      return this.#values.get(key);
    }

    set(key: K, value: V) {
      this.#values.set(key, value);
      return this;
    }

    delete(key: K) {
      return this.#values.delete(key);
    }
  },
  default: class TTLCache<K, V> {
    #values = new Map<K, V>();

    clear() {
      this.#values.clear();
    }

    cancelTimer() {}

    get(key: K) {
      return this.#values.get(key);
    }

    set(key: K, value: V) {
      this.#values.set(key, value);
      return this;
    }

    delete(key: K) {
      return this.#values.delete(key);
    }
  },
}));

import { Session } from "./session.js";
import type { ImportableSessionDescriptor, SessionOutboundMessage } from "../shared/messages.js";

function createLogger() {
  const logger = {
    child: () => logger,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger;
}

function createStoredRecord(input: {
  id: string;
  provider: string;
  sessionId?: string;
  cwd?: string;
  title?: string | null;
  archivedAt?: string | null;
}) {
  return {
    id: input.id,
    provider: input.provider,
    cwd: input.cwd ?? "/tmp/project",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    lastActivityAt: "2026-04-12T00:00:00.000Z",
    lastUserMessageAt: null,
    title: input.title ?? null,
    labels: {},
    lastStatus: "idle",
    lastModeId: null,
    config: {
      provider: input.provider,
      cwd: input.cwd ?? "/tmp/project",
    },
    runtimeInfo: {
      provider: input.provider,
      sessionId: input.sessionId ?? null,
      model: null,
      modeId: null,
    },
    features: [],
    persistence: input.sessionId
      ? {
          provider: input.provider,
          sessionId: input.sessionId,
          nativeHandle: input.sessionId,
          metadata: {
            provider: input.provider,
            cwd: input.cwd ?? "/tmp/project",
          },
        }
      : null,
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    internal: false,
    archivedAt: input.archivedAt ?? null,
  };
}

function createManagedAgent(input: {
  id: string;
  provider: string;
  sessionId: string;
  cwd?: string;
}) {
  return {
    id: input.id,
    provider: input.provider,
    cwd: input.cwd ?? "/tmp/project",
    session: {
      describePersistence: () => ({
        provider: input.provider,
        sessionId: input.sessionId,
        nativeHandle: input.sessionId,
        metadata: {
          provider: input.provider,
          cwd: input.cwd ?? "/tmp/project",
        },
      }),
    },
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    config: {
      provider: input.provider,
      cwd: input.cwd ?? "/tmp/project",
    },
    runtimeInfo: {
      provider: input.provider,
      sessionId: input.sessionId,
      model: null,
      modeId: null,
    },
    lifecycle: "idle",
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    updatedAt: new Date("2026-04-12T00:00:00.000Z"),
    availableModes: [],
    currentModeId: null,
    pendingPermissions: new Map(),
    bufferedPermissionResolutions: new Map(),
    inFlightPermissionResponses: new Set(),
    pendingReplacement: false,
    activeForegroundTurnId: null,
    foregroundTurnWaiters: new Set(),
    unsubscribeSession: null,
    timeline: [],
    timelineRows: [],
    timelineEpoch: "epoch-1",
    timelineNextSeq: 1,
    persistence: {
      provider: input.provider,
      sessionId: input.sessionId,
      nativeHandle: input.sessionId,
      metadata: {
        provider: input.provider,
        cwd: input.cwd ?? "/tmp/project",
      },
    },
    historyPrimed: true,
    lastUserMessageAt: null,
    lastUsage: undefined,
    lastError: undefined,
    attention: { requiresAttention: false },
    internal: false,
    labels: {},
  };
}

function createSessionForImportableTests(input?: {
  agentManager?: Record<string, unknown>;
  agentStorage?: Record<string, unknown>;
  onMessage?: (message: SessionOutboundMessage) => void;
}) {
  const logger = createLogger();
  return new Session({
    clientId: "test-client",
    appVersion: null,
    onMessage: input?.onMessage ?? vi.fn(),
    logger: logger as any,
    downloadTokenStore: {} as any,
    pushTokenStore: {} as any,
    paseoHome: "/tmp/paseo-import-test",
    agentManager: {
      subscribe: () => () => {},
      listAgents: () => [],
      listPersistedAgents: async () => [],
      getAgent: () => null,
      getTimeline: () => [],
      resumeAgentFromPersistence: vi.fn(),
      replaceAgentFromPersistence: vi.fn(),
      hydrateTimelineFromProvider: vi.fn(),
      notifyAgentState: vi.fn(),
      ...input?.agentManager,
    } as any,
    agentStorage: {
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      setTitle: async () => {},
      ...input?.agentStorage,
    } as any,
    projectRegistry: {
      initialize: async () => {},
      existsOnDisk: async () => true,
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      archive: async () => {},
      remove: async () => {},
    } as any,
    workspaceRegistry: {
      initialize: async () => {},
      existsOnDisk: async () => true,
      list: async () => [],
      get: async () => null,
      upsert: async () => {},
      archive: async () => {},
      remove: async () => {},
    } as any,
    chatService: {} as any,
    scheduleService: {} as any,
    loopService: {} as any,
    checkoutDiffManager: {
      subscribe: async () => ({
        initial: { cwd: "/tmp/project", files: [], error: null },
        unsubscribe: () => {},
      }),
      scheduleRefreshForCwd: () => {},
      getMetrics: () => ({
        checkoutDiffTargetCount: 0,
        checkoutDiffSubscriptionCount: 0,
        checkoutDiffWatcherCount: 0,
        checkoutDiffFallbackRefreshTargetCount: 0,
      }),
      dispose: () => {},
    } as any,
    backgroundGitFetchManager: {
      subscribe: () => () => {},
      scheduleRefreshForWorkspace: () => {},
      getState: () => null,
      dispose: () => {},
    } as any,
    createAgentMcpTransport: async () => {
      throw new Error("not used");
    },
    stt: null,
    tts: null,
    terminalManager: null,
  } as any);
}

function getPayload<T extends SessionOutboundMessage["type"]>(
  messages: SessionOutboundMessage[],
  type: T,
) {
  const message = messages.find((entry) => entry.type === type);
  return message?.payload as Extract<SessionOutboundMessage, { type: T }>["payload"] | undefined;
}

describe("importable sessions", () => {
  test("lists only sessions that are not already imported", async () => {
    const emitted: SessionOutboundMessage[] = [];
    const session = createSessionForImportableTests({
      onMessage: (message) => emitted.push(message),
      agentManager: {
        listAgents: () => [createManagedAgent({ id: "live-1", provider: "claude", sessionId: "claude-1" })],
        listPersistedAgents: async () => [
          {
            provider: "claude",
            sessionId: "claude-1",
            cwd: "/tmp/claude",
            title: "Already live",
            lastActivityAt: new Date("2026-04-12T01:00:00.000Z"),
            persistence: {
              provider: "claude",
              sessionId: "claude-1",
              nativeHandle: "claude-1",
              metadata: { provider: "claude", cwd: "/tmp/claude" },
            },
            timeline: [],
          },
          {
            provider: "codex",
            sessionId: "codex-1",
            cwd: "/tmp/codex",
            title: "Already stored",
            lastActivityAt: new Date("2026-04-12T02:00:00.000Z"),
            persistence: {
              provider: "codex",
              sessionId: "codex-1",
              nativeHandle: "codex-1",
              metadata: { provider: "codex", cwd: "/tmp/codex" },
            },
            timeline: [],
          },
          {
            provider: "copilot",
            sessionId: "copilot-1",
            cwd: "/tmp/copilot",
            title: "Import me",
            lastActivityAt: new Date("2026-04-12T03:00:00.000Z"),
            persistence: {
              provider: "copilot",
              sessionId: "copilot-1",
              nativeHandle: "copilot-1",
              metadata: { provider: "copilot", cwd: "/tmp/copilot" },
            },
            timeline: [{ type: "assistant_message", text: "hello" }],
          },
        ],
      },
      agentStorage: {
        list: async () => [createStoredRecord({ id: "stored-1", provider: "codex", sessionId: "codex-1" })],
      },
    });

    await session.handleMessage({
      type: "list_importable_sessions_request",
      requestId: "req-1",
      limit: 10,
    });

    const payload = getPayload(emitted, "list_importable_sessions_response");
    expect(payload?.requestId).toBe("req-1");
    expect(payload?.entries).toEqual([
      {
        provider: "copilot",
        sessionId: "copilot-1",
        cwd: "/tmp/copilot",
        title: "Import me",
        lastActivityAt: "2026-04-12T03:00:00.000Z",
        persistence: {
          provider: "copilot",
          sessionId: "copilot-1",
          nativeHandle: "copilot-1",
          metadata: { provider: "copilot", cwd: "/tmp/copilot" },
        },
        timeline: [{ type: "assistant_message", text: "hello" }],
      } satisfies ImportableSessionDescriptor,
    ]);
  });

  test("returns the existing stored agent when an imported session is requested again", async () => {
    const emitted: SessionOutboundMessage[] = [];
    const setTitle = vi.fn();
    const storedRecord = createStoredRecord({
      id: "agent-existing",
      provider: "codex",
      sessionId: "codex-2",
      title: "Old title",
      archivedAt: "2026-04-11T00:00:00.000Z",
    });
    const updatedRecord = {
      ...storedRecord,
      title: "Recovered Codex Chat",
      archivedAt: null,
      updatedAt: "2026-04-12T04:00:00.000Z",
    };

    const session = createSessionForImportableTests({
      onMessage: (message) => emitted.push(message),
      agentManager: {
        resumeAgentFromPersistence: vi.fn(),
      },
      agentStorage: {
        list: async () => [storedRecord],
        get: async (agentId: string) => (agentId === "agent-existing" ? updatedRecord : null),
        setTitle: async (...args: unknown[]) => {
          setTitle(...args);
        },
        upsert: async () => {},
      },
    });

    await session.handleMessage({
      type: "import_importable_session_request",
      requestId: "req-2",
      handle: {
        provider: "codex",
        sessionId: "codex-2",
        nativeHandle: "codex-2",
        metadata: { provider: "codex", cwd: "/tmp/project" },
      },
      title: "Recovered Codex Chat",
    });

    const payload = getPayload(emitted, "import_importable_session_response");
    expect(payload?.requestId).toBe("req-2");
    expect(payload?.agent.id).toBe("agent-existing");
    expect(payload?.agent.title).toBe("Recovered Codex Chat");
    expect(setTitle).toHaveBeenCalledWith("agent-existing", "Recovered Codex Chat");
  });

  test("imports a new external session by resuming persistence and hydrating history", async () => {
    const emitted: SessionOutboundMessage[] = [];
    const resumeAgentFromPersistence = vi.fn();
    const hydrateTimelineFromProvider = vi.fn();
    const setTitle = vi.fn();
    const managedAgent = createManagedAgent({
      id: "agent-new",
      provider: "claude",
      sessionId: "claude-9",
      cwd: "/tmp/imported",
    });
    let storedRecord = createStoredRecord({
      id: "agent-new",
      provider: "claude",
      sessionId: "claude-9",
      cwd: "/tmp/imported",
      title: null,
    });

    const session = createSessionForImportableTests({
      onMessage: (message) => emitted.push(message),
      agentManager: {
        getAgent: (agentId: string) => (agentId === "agent-new" ? managedAgent : null),
        resumeAgentFromPersistence: async (handle: unknown) => {
          resumeAgentFromPersistence(handle);
          return managedAgent;
        },
        hydrateTimelineFromProvider: async (agentId: string) => {
          hydrateTimelineFromProvider(agentId);
        },
      },
      agentStorage: {
        list: async () => [],
        get: async (agentId: string) => (agentId === "agent-new" ? storedRecord : null),
        setTitle: async (agentId: string, title: string) => {
          setTitle(agentId, title);
          storedRecord = { ...storedRecord, title };
        },
      },
    });

    await session.handleMessage({
      type: "import_importable_session_request",
      requestId: "req-3",
      handle: {
        provider: "claude",
        sessionId: "claude-9",
        nativeHandle: "claude-9",
        metadata: { provider: "claude", cwd: "/tmp/imported" },
      },
      title: "Recovered Claude Chat",
    });

    const payload = getPayload(emitted, "import_importable_session_response");
    expect(resumeAgentFromPersistence).toHaveBeenCalledTimes(1);
    expect(hydrateTimelineFromProvider).toHaveBeenCalledWith("agent-new");
    expect(setTitle).toHaveBeenCalledWith("agent-new", "Recovered Claude Chat");
    expect(payload?.agent.id).toBe("agent-new");
    expect(payload?.agent.title).toBe("Recovered Claude Chat");
    expect(payload?.agent.persistence?.sessionId).toBe("claude-9");
  });

  test("reuses the current empty agent when targetAgentId is provided", async () => {
    const emitted: SessionOutboundMessage[] = [];
    const replaceAgentFromPersistence = vi.fn();
    const hydrateTimelineFromProvider = vi.fn();
    let currentAgent = {
      ...createManagedAgent({
        id: "agent-empty",
        provider: "codex",
        sessionId: "codex-empty",
        cwd: "/tmp/imported",
      }),
      timeline: [],
      lastUserMessageAt: null,
    };
    const managedAgent = createManagedAgent({
      id: "agent-empty",
      provider: "codex",
      sessionId: "codex-imported",
      cwd: "/tmp/imported",
    });

    const session = createSessionForImportableTests({
      onMessage: (message) => emitted.push(message),
      agentManager: {
        getAgent: (agentId: string) => (agentId === "agent-empty" ? currentAgent : null),
        getTimeline: (agentId: string) => (agentId === "agent-empty" ? [] : []),
        replaceAgentFromPersistence: async (agentId: string, handle: unknown) => {
          replaceAgentFromPersistence(agentId, handle);
          currentAgent = managedAgent as any;
          return managedAgent;
        },
        hydrateTimelineFromProvider: async (agentId: string) => {
          hydrateTimelineFromProvider(agentId);
        },
      },
      agentStorage: {
        list: async () => [],
        get: async () => createStoredRecord({
          id: "agent-empty",
          provider: "codex",
          sessionId: "codex-imported",
          cwd: "/tmp/imported",
          title: "Recovered current session",
        }),
      },
    });

    await session.handleMessage({
      type: "import_importable_session_request",
      requestId: "req-4",
      targetAgentId: "agent-empty",
      handle: {
        provider: "codex",
        sessionId: "codex-imported",
        nativeHandle: "codex-imported",
        metadata: { provider: "codex", cwd: "/tmp/imported" },
      },
      title: "Recovered current session",
    });

    const payload = getPayload(emitted, "import_importable_session_response");
    expect(replaceAgentFromPersistence).toHaveBeenCalledWith(
      "agent-empty",
      expect.objectContaining({
        provider: "codex",
        sessionId: "codex-imported",
      }),
    );
    expect(hydrateTimelineFromProvider).toHaveBeenCalledWith("agent-empty");
    expect(payload?.agent.id).toBe("agent-empty");
  });
});
