import type { KaiContext, KaiMessage, KaiMessageType, TonePreference } from "./types.js";

type TemplateMap = Record<KaiMessageType, Record<TonePreference, string>>;

const templates: TemplateMap = {
  celebration: {
    supportive:
      "Nice work, {name}. You're building real momentum. Let's keep this week moving.",
    balanced:
      "Strong work, {name}. That session counts, and the consistency is showing.",
    direct: "Good work, {name}. You showed up and moved things forward."
  },
  confidence: {
    supportive:
      "Nice job, {name}. Every completed session makes this routine feel more natural.",
    balanced:
      "Well done, {name}. That's another step toward making training a habit.",
    direct: "You got it done, {name}. One more solid rep for consistency."
  },
  reinforcement: {
    supportive:
      "You're back in rhythm, {name}. Keep the next step simple and repeatable.",
    balanced:
      "You're staying on track, {name}. Stack another good session soon.",
    direct: "Solid. Stay with the plan and keep the rhythm going, {name}."
  },
  accountability: {
    supportive:
      "You missed one, {name}, and that's fine. Let's reset quickly with a smaller win next.",
    balanced:
      "That one slipped, {name}. The move now is simple: get the next session done.",
    direct: "You missed this one, {name}. Get the next workout back on schedule."
  },
  reset: {
    supportive:
      "No spiral, {name}. We reset with one manageable workout and build again from there.",
    balanced:
      "This week needs a reset, {name}. Let's make the next workout short and achievable.",
    direct:
      "Reset here, {name}. Lower the barrier, do the next session, and rebuild momentum."
  },
  reflection: {
    supportive:
      "This week gave us a clear signal, {name}. The goal now is steady effort, not perfection.",
    balanced:
      "Here's the pattern, {name}: keep the routine simple and repeatable next week.",
    direct:
      "Weekly check-in, {name}: protect the routine and make next week more consistent."
  }
};

export function buildKaiMessage(
  type: KaiMessageType,
  tone: TonePreference,
  context: KaiContext
): KaiMessage {
  const text = fillTemplate(templates[type][tone], context);

  return {
    type,
    tone,
    text
  };
}

function fillTemplate(template: string, context: KaiContext): string {
  return template.replace("{name}", context.user.name);
}
