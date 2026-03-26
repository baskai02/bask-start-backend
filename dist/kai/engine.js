import { decideKaiMessage } from "./rules.js";
import { buildKaiState } from "./state.js";
import { buildKaiMessage } from "./templates.js";
export function runKaiCoaching(input) {
    const nextState = buildKaiState(input.workouts, input.event, input.previousState);
    const decision = decideKaiMessage({
        user: input.user,
        workouts: input.workouts,
        progressLogs: input.progressLogs,
        event: input.event,
        state: nextState
    });
    const message = buildKaiMessage(decision.messageType, decision.tone, {
        user: input.user,
        workouts: input.workouts,
        progressLogs: input.progressLogs,
        event: input.event,
        state: nextState
    });
    return {
        nextState: {
            ...nextState,
            lastKaiMessageType: message.type,
            lastKaiMessageAt: input.event.occurredAt
        },
        message
    };
}
