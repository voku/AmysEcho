export function splitHandsFromMultimodalFrame(multimodalLandmarks: number[][]): number[][][] {
  const handPoints = multimodalLandmarks.slice(0, 42);
  const leftHand = handPoints.slice(0, 21);
  const rightHand = handPoints.slice(21, 42);

  const hasLeft = leftHand.some((point) => point.some((value) => value !== 0));
  const hasRight = rightHand.some((point) => point.some((value) => value !== 0));

  const hands: number[][][] = [];
  if (hasLeft) hands.push(leftHand);
  if (hasRight) hands.push(rightHand);
  return hands;
}
