export function getHorizontalSwipeDirection(
  { startX, startY, endX, endY },
  { minDistance, horizontalAxisRatio = 1.2 },
) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);

  if (
    horizontalDistance < minDistance ||
    horizontalDistance < verticalDistance * horizontalAxisRatio
  ) {
    return null;
  }

  return deltaX > 0 ? "right" : "left";
}
