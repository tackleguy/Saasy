/**
 * Shared, mutable movement input for walk mode.
 * -----------------------------------------------------------------------------
 * The on-screen touch pad (HTML) writes here and the WalkControls frame loop
 * (inside the WebGL canvas) reads it every frame. A plain object avoids
 * re-rendering React 60 times a second while a button is held.
 */
export const walkInput = {
  /** +1 forward, −1 backward. */
  forward: 0,
  /** +1 right, −1 left. */
  strafe: 0,
};

export function resetWalkInput() {
  walkInput.forward = 0;
  walkInput.strafe = 0;
}
