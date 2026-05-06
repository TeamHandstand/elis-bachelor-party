"use client";
// Tiny typed fetcher for host UI. Server route handlers are expected to
// match the request/response shapes in `lib/api/contract.ts`.

import type {
  AssignPlayerRequest,
  AssignPlayerResponse,
  CreateEventRequest,
  CreateEventResponse,
  GetEventResponse,
  HostLoginRequest,
  HostLoginResponse,
  ListEventsResponse,
  ResetEventRequest,
  ResetEventResponse,
  ResultsResponse,
  StartEventResponse,
  UpdateEventRequest,
  UpdateEventResponse,
} from "@/lib/api/contract";

class FetchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface HttpInit extends Omit<RequestInit, "body"> {
  body?: unknown;
}

async function http<TRes>(url: string, init?: HttpInit): Promise<TRes> {
  const { body, headers, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      if (text) msg = text;
    } catch {
      /* ignore */
    }
    throw new FetchError(res.status, msg);
  }
  // Some endpoints might return empty bodies; guard for JSON parse.
  const text = await res.text();
  if (!text) return {} as TRes;
  return JSON.parse(text) as TRes;
}

export async function hostLogin(body: HostLoginRequest): Promise<HostLoginResponse> {
  return http<HostLoginResponse>("/api/host/login", { method: "POST", body });
}

export async function listEvents(): Promise<ListEventsResponse> {
  return http<ListEventsResponse>("/api/host/events", { method: "GET", cache: "no-store" });
}

export async function createEvent(body: CreateEventRequest = {}): Promise<CreateEventResponse> {
  return http<CreateEventResponse>("/api/events", { method: "POST", body });
}

export async function getEvent(code: string): Promise<GetEventResponse> {
  return http<GetEventResponse>(`/api/events/${code}`, { method: "GET", cache: "no-store" });
}

export async function deleteEvent(code: string): Promise<{ ok: true }> {
  return http<{ ok: true }>(`/api/events/${code}`, { method: "DELETE" });
}

export async function patchEvent(
  code: string,
  body: UpdateEventRequest
): Promise<UpdateEventResponse> {
  return http<UpdateEventResponse>(`/api/events/${code}`, { method: "PATCH", body });
}

export async function assignPlayer(
  code: string,
  playerId: string,
  body: AssignPlayerRequest
): Promise<AssignPlayerResponse> {
  return http<AssignPlayerResponse>(
    `/api/events/${code}/players/${playerId}`,
    { method: "PATCH", body }
  );
}

export async function startEvent(code: string): Promise<StartEventResponse> {
  return http<StartEventResponse>(`/api/events/${code}/start`, { method: "POST" });
}

export async function resetEvent(
  code: string,
  body: ResetEventRequest
): Promise<ResetEventResponse> {
  return http<ResetEventResponse>(`/api/events/${code}/reset`, { method: "POST", body });
}

export async function getResults(code: string): Promise<ResultsResponse> {
  return http<ResultsResponse>(`/api/events/${code}/results`, { method: "GET", cache: "no-store" });
}

export { FetchError };

import type {
  EndRoundRequest,
  EndRoundResponse,
  SetHostPlayerRequest,
  SetHostPlayerResponse,
  StartRoundRequest,
  StartRoundResponse,
} from "@/lib/api/contract";

export async function setHostPlayer(
  code: string,
  body: SetHostPlayerRequest,
): Promise<SetHostPlayerResponse> {
  return http<SetHostPlayerResponse>(`/api/events/${code}/host-player`, {
    method: "PATCH",
    body,
  });
}

export async function startRound(
  code: string,
  body: StartRoundRequest = {},
): Promise<StartRoundResponse> {
  return http<StartRoundResponse>(`/api/events/${code}/round/start`, {
    method: "POST",
    body,
  });
}

export async function endRound(
  code: string,
  body: EndRoundRequest,
): Promise<EndRoundResponse> {
  return http<EndRoundResponse>(`/api/events/${code}/round/end`, {
    method: "POST",
    body,
  });
}

export async function resetRound(
  code: string,
  body: { playerId?: string; roundIndex: number },
): Promise<{ event: import("@/lib/types").EventConfig }> {
  return http(`/api/events/${code}/round/reset`, {
    method: "POST",
    body,
  });
}

import type {
  EndEventRequest,
  EndEventResponse,
} from "@/lib/api/contract";

export async function endEvent(
  code: string,
  body: EndEventRequest = {},
): Promise<EndEventResponse> {
  return http<EndEventResponse>(`/api/events/${code}/end`, {
    method: "POST",
    body,
  });
}

import type {
  CreateTeamRequest,
  CreateTeamResponse,
} from "@/lib/api/contract";

export async function createTeam(
  code: string,
  body: CreateTeamRequest = {},
): Promise<CreateTeamResponse> {
  return http<CreateTeamResponse>(`/api/events/${code}/teams`, {
    method: "POST",
    body,
  });
}

export async function deleteTeam(
  code: string,
  teamId: string,
): Promise<{ ok: true }> {
  return http<{ ok: true }>(`/api/events/${code}/teams/${teamId}`, {
    method: "DELETE",
  });
}

import type {
  ActivateEventRequest,
  ActivateEventResponse,
} from "@/lib/api/contract";

export async function activateEvent(
  code: string,
  body: ActivateEventRequest = {},
): Promise<ActivateEventResponse> {
  return http<ActivateEventResponse>(`/api/events/${code}/activate`, {
    method: "POST",
    body,
  });
}

import type {
  JoinEventRequest,
  JoinEventResponse,
} from "@/lib/api/contract";

export async function addPlayer(
  code: string,
  body: JoinEventRequest,
): Promise<JoinEventResponse> {
  return http<JoinEventResponse>(`/api/events/${code}/players`, {
    method: "POST",
    body,
  });
}

import type {
  CreateTriviaPresetRequest,
  CreateTriviaPresetResponse,
  ListTriviaPresetsResponse,
  UpdateTriviaPresetRequest,
  UpdateTriviaPresetResponse,
} from "@/lib/api/contract";

export async function listTriviaPresets(): Promise<ListTriviaPresetsResponse> {
  return http<ListTriviaPresetsResponse>("/api/trivia-presets", {
    method: "GET",
    cache: "no-store",
  });
}

export async function createTriviaPreset(
  body: CreateTriviaPresetRequest,
): Promise<CreateTriviaPresetResponse> {
  return http<CreateTriviaPresetResponse>("/api/trivia-presets", {
    method: "POST",
    body,
  });
}

export async function updateTriviaPreset(
  id: string,
  body: UpdateTriviaPresetRequest,
): Promise<UpdateTriviaPresetResponse> {
  return http<UpdateTriviaPresetResponse>(`/api/trivia-presets/${id}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteTriviaPreset(id: string): Promise<{ ok: true }> {
  return http<{ ok: true }>(`/api/trivia-presets/${id}`, {
    method: "DELETE",
  });
}
