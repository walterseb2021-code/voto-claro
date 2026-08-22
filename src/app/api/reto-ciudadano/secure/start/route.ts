import { type NextRequest } from "next/server";

import { participantJson } from "@/lib/participantApi";
import {
  buildInitialCaminoPrizeState,
  buildInitialPrincipalPrizeState,
  createRetoPrizeSession,
  expireRetoSession,
  getPrincipalPrizeStartLock,
  isRetoSessionExpired,
  loadAnyActiveRetoSession,
  parseCaminoPrizeState,
  parsePrincipalPrizeState,
  type RetoSessionRow,
} from "@/lib/retoSecureGame";
import {
  parseRetoGameCode,
  publicRetoSession,
  resolveRetoPrizeMutation,
  retoConflict,
  retoUnavailable,
} from "@/lib/retoSecureApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicStartProgress(session: RetoSessionRow) {
  if (session.game_code === "principal") {
    const state = parsePrincipalPrizeState(session.state);
    if (!state) return null;

    return {
      game_code: "principal" as const,
      phase: state.phase,
      level: state.level,
      question_index: state.question_index,
      good: state.good,
      bad: state.bad,
      skipped: state.skipped,
      level1_passed: state.level1_passed,
      level2_passed: state.level2_passed,
      party_id: state.party_id,
      pool_deadline: state.pool_deadline,
    };
  }

  const state = parseCaminoPrizeState(session.state);
  if (!state) return null;

  return {
    game_code: "camino" as const,
    position: state.position,
    turns_left: state.turns_left,
    won: state.won,
  };
}

export async function POST(req: NextRequest) {
  try {
    const prelude = await resolveRetoPrizeMutation(req, ["game_code"]);
    if (!prelude.ok) return prelude.response;

    const gameCode = parseRetoGameCode(prelude.body.game_code);
    if (!gameCode) {
      return participantJson(400, {
        ok: false,
        code: "RETO_GAME_INVALID",
        error: "Juego invÃ¡lido.",
      });
    }

    const { context } = prelude;

    let active = await loadAnyActiveRetoSession(
      context.supabase,
      context.participant.id,
      gameCode
    );

    if (!active.ok) {
      return active.reason === "unavailable"
        ? retoUnavailable("RETO_SESSION_LOOKUP_FAILED")
        : retoConflict("RETO_SESSION_INVALID");
    }

    if (active.session && isRetoSessionExpired(active.session)) {
      const expired = await expireRetoSession(context.supabase, active.session);

      if (!expired.ok) {
        return expired.reason === "unavailable"
          ? retoUnavailable("RETO_SESSION_EXPIRE_FAILED")
          : retoConflict();
      }

      active = { ok: true, session: null };
    }

    if (active.session) {
      if (active.session.group_code !== context.group) {
        return retoConflict("RETO_SESSION_GROUP_MISMATCH");
      }

      const progress = publicStartProgress(active.session);
      if (!progress) return retoConflict("RETO_STATE_INVALID");

      return participantJson(200, {
        ok: true,
        resumed: true,
        session: publicRetoSession(active.session),
        progress,
      });
    }

    if (gameCode === "principal") {
      const lock = await getPrincipalPrizeStartLock(
        context.supabase,
        context.participant.id
      );

      if (!lock.ok) {
        return lock.reason === "unavailable"
          ? retoUnavailable("RETO_LOCK_LOOKUP_FAILED")
          : retoConflict("RETO_LOCK_STATE_INVALID");
      }

      if (lock.locked) {
        return participantJson(423, {
          ok: false,
          code: "RETO_PRINCIPAL_LOCKED",
          error: "Debes esperar antes de iniciar un nuevo intento con premio.",
          locked_until: lock.lockedUntil,
        });
      }
    }

    const initialState =
      gameCode === "principal"
        ? buildInitialPrincipalPrizeState()
        : buildInitialCaminoPrizeState();

    const created = await createRetoPrizeSession(
      context.supabase,
      context.participant.id,
      context.group,
      gameCode,
      initialState
    );

    if (!created.ok) {
      return created.reason === "unavailable"
        ? retoUnavailable("RETO_SESSION_CREATE_FAILED")
        : retoConflict();
    }

    const progress = publicStartProgress(created.session);
    if (!progress) return retoConflict("RETO_STATE_INVALID");

    return participantJson(201, {
      ok: true,
      resumed: false,
      session: publicRetoSession(created.session),
      progress,
    });
  } catch {
    console.error("[reto-secure-start] unexpected failure");
    return retoUnavailable();
  }
}