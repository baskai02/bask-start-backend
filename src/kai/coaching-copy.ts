export function describeConservativeSlotCue(
  slot: "main" | "secondary" | "accessory"
): string {
  return slot === "main"
    ? "Keep this main lift comfortable today and leave a little in the tank."
    : "Keep this part light and straightforward today.";
}

export function describeStrainedComparableCue(
  slot: "main" | "secondary" | "accessory"
): string {
  return slot === "main"
    ? "Recent sets got harder as the session went on, so repeat this cleanly before adding more."
    : "Recent sets got harder as the session went on, so keep this part easier for now.";
}

export function describeConservativeSessionHeadline(): string {
  return "Train, but keep it lighter than usual.";
}

export function describeConservativeDayNote(): string {
  return "Today is meant to be a lighter session inside the week.";
}

export function describeConservativeWorkoutRationale(): string {
  return "Keep this easier today so recovery stays on track.";
}

export function describeConservativeCoachNote(): string {
  return "Use one lower-body movement, one press, and one pull. Finish feeling good rather than trying to squeeze out more.";
}

export function describeConservativeStructureNote(): string {
  return "Keep the structure simple and leave a little energy in the tank.";
}

export function describeConservativeTemplateCoachNote(): string {
  return "Keep the planned structure, but make the whole day feel lighter and easier to recover from.";
}

export function describeModifiedSupportCue(): string {
  return "Keep this support work light and straightforward today.";
}

export function describeLightDaySlotCue(
  slot: "main" | "secondary" | "accessory"
): string {
  return slot === "main"
    ? "Keep this main lift easy today and stop well before it gets grindy."
    : "Keep this part easy today and stop once it stops feeling clean.";
}

export function describeCalmerDayRepeatCue(): string {
  return "Today is more about moving well than pushing, so repeat this slot cleanly.";
}
