import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import { useAgentCommandsQuery, type DraftCommandConfig } from "./use-agent-commands-query";
import { orderAutocompleteOptions } from "@/components/ui/autocomplete-utils";
import { useAutocomplete } from "./use-autocomplete";
import { useSessionStore } from "@/stores/session-store";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  filterImportableSessionsForWorkspace,
  getImportableSessionProviderLabel,
  groupImportableSessionsByProvider,
  sortImportableSessions,
} from "@/hooks/importable-sessions-utils";
import {
  applyFileMentionReplacement,
  findActiveFileMention,
  type FileMentionRange,
} from "@/utils/file-mention-autocomplete";
import type { ImportableSessionEntry } from "@server/client/daemon-client";

interface UseAgentAutocompleteInput {
  userInput: string;
  cursorIndex: number;
  setUserInput: (nextValue: string) => void;
  serverId: string;
  agentId: string;
  draftConfig?: DraftCommandConfig;
  onAutocompleteApplied?: () => void;
}

type AgentAutocompleteOption =
  | (AutocompleteOption & { type: "command" })
  | (AutocompleteOption & {
      type: "importable_session";
      session: ImportableSessionEntry;
    })
  | (AutocompleteOption & {
      type: "workspace_entry";
      entryPath: string;
      mention: FileMentionRange;
    });

interface AgentAutocompleteResult {
  isVisible: boolean;
  options: AutocompleteOption[];
  selectedIndex: number;
  isLoading: boolean;
  errorMessage?: string;
  loadingText: string;
  emptyText: string;
  onSelectOption: (option: AutocompleteOption) => void;
  onKeyPress: (event: { key: string; preventDefault: () => void }) => boolean;
}

interface DirectorySuggestionEntry {
  path: string;
  kind: "file" | "directory";
}

const RESUME_COMMAND_NAME = "resume";
const RESUME_COMMAND_DESCRIPTION = "Resume an existing provider session";

function normalizeDraftCommandConfig(
  draftConfig?: DraftCommandConfig,
): DraftCommandConfig | undefined {
  if (!draftConfig) {
    return undefined;
  }

  const cwd = draftConfig.cwd.trim();
  if (!cwd) {
    return undefined;
  }

  const modeId = draftConfig.modeId?.trim() ?? "";
  const model = draftConfig.model?.trim() ?? "";
  const thinkingOptionId = draftConfig.thinkingOptionId?.trim() ?? "";
  const featureValues = draftConfig.featureValues;
  return {
    provider: draftConfig.provider,
    cwd,
    ...(modeId ? { modeId } : {}),
    ...(model ? { model } : {}),
    ...(thinkingOptionId ? { thinkingOptionId } : {}),
    ...(featureValues && Object.keys(featureValues).length > 0 ? { featureValues } : {}),
  };
}

function mapDirectorySuggestionsToEntries(payload: {
  entries?: Array<{ path: string; kind: string }>;
  directories?: string[];
}): DirectorySuggestionEntry[] {
  if (Array.isArray(payload.entries) && payload.entries.length > 0) {
    return payload.entries.flatMap((entry) => {
      if (
        !entry ||
        typeof entry.path !== "string" ||
        (entry.kind !== "file" && entry.kind !== "directory")
      ) {
        return [];
      }
      return [{ path: entry.path, kind: entry.kind }];
    });
  }

  return (payload.directories ?? []).map((path) => ({
    path,
    kind: "directory" as const,
  }));
}

export function useAgentAutocomplete(input: UseAgentAutocompleteInput): AgentAutocompleteResult {
  const {
    userInput,
    cursorIndex,
    setUserInput,
    serverId,
    agentId,
    draftConfig,
    onAutocompleteApplied,
  } = input;

  const resumeCommandMatch = userInput.match(/^\/resume(?:\s+(.*))?$/);
  const showImportableSessionAutocomplete = Boolean(resumeCommandMatch);
  const showCommandAutocomplete =
    userInput.startsWith("/") && !userInput.includes(" ") && !showImportableSessionAutocomplete;
  const commandFilterQuery = showCommandAutocomplete ? userInput.slice(1) : "";
  const importableSessionQuery = resumeCommandMatch?.[1]?.trim().toLowerCase() ?? "";

  const activeFileMention = useMemo(
    () =>
      findActiveFileMention({
        text: userInput,
        cursorIndex,
      }),
    [cursorIndex, userInput],
  );
  const showFileAutocomplete = activeFileMention !== null;
  const fileFilterQuery = activeFileMention?.query ?? "";

  const normalizedDraftConfig = useMemo(
    () => normalizeDraftCommandConfig(draftConfig),
    [draftConfig],
  );

  const isDraftContext = normalizedDraftConfig !== undefined;
  const queryDraftConfig = isDraftContext ? normalizedDraftConfig : undefined;
  const canLoadCommands = Boolean(serverId) && (Boolean(agentId) || isDraftContext);

  const agentCwd = useSessionStore(
    (state) => state.sessions[serverId]?.agents?.get(agentId)?.cwd ?? "",
  );
  const autocompleteCwd = useMemo(() => {
    if (isDraftContext) {
      return queryDraftConfig?.cwd ?? "";
    }
    return agentCwd.trim();
  }, [agentCwd, isDraftContext, queryDraftConfig]);

  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);

  const mode: "command" | "file" | "importable_session" | null = showFileAutocomplete
    ? "file"
    : showImportableSessionAutocomplete
      ? "importable_session"
    : showCommandAutocomplete
      ? "command"
      : null;
  const isVisible =
    mode === "command"
      ? canLoadCommands
      : mode === "importable_session"
        ? Boolean(serverId) && Boolean(client) && autocompleteCwd.length > 0
      : mode === "file"
        ? Boolean(serverId) && autocompleteCwd.length > 0
        : false;

  const {
    commands,
    isLoading: isCommandsLoading,
    isError,
    error,
  } = useAgentCommandsQuery({
    serverId,
    agentId,
    enabled: mode === "command" && canLoadCommands,
    draftConfig: queryDraftConfig,
  });

  const fileSuggestionsQuery = useQuery({
    queryKey: ["directorySuggestions", serverId, autocompleteCwd, fileFilterQuery, true, true],
    queryFn: async (): Promise<DirectorySuggestionEntry[]> => {
      if (!client) {
        throw new Error("Daemon client unavailable");
      }
      const response = await client.getDirectorySuggestions({
        cwd: autocompleteCwd,
        query: fileFilterQuery,
        limit: 50,
        includeFiles: true,
        includeDirectories: true,
      });
      if (response.error) {
        throw new Error(response.error);
      }
      return mapDirectorySuggestionsToEntries(response);
    },
    enabled:
      mode === "file" &&
      Boolean(serverId) &&
      autocompleteCwd.length > 0 &&
      Boolean(client) &&
      isConnected,
    retry: false,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const importableSessionsQuery = useQuery({
    queryKey: ["importableSessionsAutocomplete", serverId, autocompleteCwd],
    queryFn: async (): Promise<ImportableSessionEntry[]> => {
      if (!client) {
        throw new Error("Daemon client unavailable");
      }
      const response = await client.listImportableSessions({
        limit: 100,
      });
      return sortImportableSessions(response.entries);
    },
    enabled: mode === "importable_session" && Boolean(client) && autocompleteCwd.length > 0,
    retry: false,
    staleTime: 15_000,
  });

  const options = useMemo<AgentAutocompleteOption[]>(() => {
    if (!isVisible) {
      return [];
    }

    if (mode === "command") {
      const filterLower = commandFilterQuery.toLowerCase();
      const syntheticResumeCommand = RESUME_COMMAND_NAME.includes(filterLower)
        ? [
            {
              name: RESUME_COMMAND_NAME,
              description: RESUME_COMMAND_DESCRIPTION,
              argumentHint: "provider-session-id",
            },
          ]
        : [];
      const matches = [...syntheticResumeCommand, ...commands].filter((cmd, index, all) => {
        if (!cmd.name.toLowerCase().includes(filterLower)) {
          return false;
        }
        return all.findIndex((candidate) => candidate.name === cmd.name) === index;
      });
      const orderedMatches = orderAutocompleteOptions(matches);
      return orderedMatches.map((cmd) => ({
        type: "command" as const,
        id: cmd.name,
        label: `/${cmd.name}`,
        detail: cmd.argumentHint || undefined,
        description: cmd.description,
        kind: "command",
      }));
    }

    if (mode === "importable_session") {
      const matches = filterImportableSessionsForWorkspace(
        importableSessionsQuery.data ?? [],
        autocompleteCwd,
      ).filter((entry) => {
        if (!importableSessionQuery) {
          return true;
        }
        const haystack = [
          getImportableSessionProviderLabel(entry.provider),
          entry.sessionId,
          entry.title ?? "",
          entry.cwd,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(importableSessionQuery);
      });
      const groupedMatches = groupImportableSessionsByProvider(matches);
      const orderedMatches = orderAutocompleteOptions(
        groupedMatches.flatMap((group) =>
          group.entries.map((entry) => ({
            type: "importable_session" as const,
            id: `${entry.provider}:${entry.sessionId}`,
            label: entry.title || entry.sessionId,
            detail: shortenAutocompletePath(entry.cwd),
            description: entry.sessionId,
            kind: "command" as const,
            session: entry,
          })),
        ),
      );
      return orderedMatches.map((option, index, all) => ({
        ...option,
        groupLabel:
          index === 0 || all[index - 1]?.session.provider !== option.session.provider
            ? getImportableSessionProviderLabel(option.session.provider)
            : undefined,
      }));
    }

    if (mode === "file" && activeFileMention) {
      const orderedEntries = orderAutocompleteOptions(fileSuggestionsQuery.data ?? []);
      return orderedEntries.map((entry) => ({
        type: "workspace_entry" as const,
        id: `${entry.kind}:${entry.path}`,
        label: entry.path,
        kind: entry.kind,
        entryPath: entry.path,
        mention: activeFileMention,
      }));
    }

    return [];
  }, [
    activeFileMention,
    autocompleteCwd,
    commandFilterQuery,
    commands,
    fileSuggestionsQuery.data,
    importableSessionQuery,
    importableSessionsQuery.data,
    isVisible,
    mode,
  ]);

  const onSelectOption = useCallback(
    (option: AutocompleteOption) => {
      const selected = option as AgentAutocompleteOption;
      if (selected.type === "command") {
        setUserInput(`/${selected.id} `);
        onAutocompleteApplied?.();
        return;
      }

      if (selected.type === "importable_session") {
        setUserInput(`/${RESUME_COMMAND_NAME} ${selected.session.sessionId}`);
        onAutocompleteApplied?.();
        return;
      }

      const nextInput = applyFileMentionReplacement({
        text: userInput,
        mention: selected.mention,
        relativePath: selected.entryPath,
      });
      setUserInput(nextInput);
      onAutocompleteApplied?.();
    },
    [onAutocompleteApplied, setUserInput, userInput],
  );

  const { selectedIndex, onKeyPress } = useAutocomplete({
    isVisible,
    options,
    query: mode === "command" ? commandFilterQuery : fileFilterQuery,
    onSelectOption,
    onEscape: mode === "command" ? () => setUserInput("") : undefined,
  });

  const isLoading =
    mode === "command"
      ? isCommandsLoading
      : mode === "importable_session"
        ? importableSessionsQuery.isPending
        : mode === "file"
          ? fileSuggestionsQuery.isPending || (fileSuggestionsQuery.isLoading && options.length === 0)
          : false;
  const errorMessage =
    mode === "command"
      ? isError
        ? (error?.message ?? "Failed to load")
        : undefined
      : mode === "importable_session"
        ? importableSessionsQuery.error instanceof Error
          ? importableSessionsQuery.error.message
          : undefined
      : mode === "file"
        ? fileSuggestionsQuery.error instanceof Error
          ? fileSuggestionsQuery.error.message
          : undefined
        : undefined;

  const loadingText =
    mode === "file"
      ? "Searching workspace..."
      : mode === "importable_session"
        ? "Loading resumable sessions..."
        : "Loading commands...";
  const emptyText =
    mode === "file"
      ? "No files or directories found"
      : mode === "importable_session"
        ? "No resumable sessions found"
        : "No commands found";

  return {
    isVisible,
    options,
    selectedIndex,
    isLoading,
    errorMessage,
    loadingText,
    emptyText,
    onSelectOption,
    onKeyPress,
  };
}

function shortenAutocompletePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length <= 48) {
    return trimmed;
  }
  return `...${trimmed.slice(trimmed.length - 45)}`;
}
