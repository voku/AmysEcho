export const encouragementMessages = [
  "Great job! Let's practice {gesture} again.",
  "You're doing great—want to try {gesture} once more?",
  "Let's give {gesture} another go together.",
];

export function getEncouragementMessage(gesture: string): string {
  const msg = encouragementMessages[Math.floor(Math.random() * encouragementMessages.length)];
  return msg.replace('{gesture}', gesture);
}
