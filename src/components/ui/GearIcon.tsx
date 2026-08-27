/**
 * The settings glyph, used everywhere a settings control appears.
 *
 * A solid six-tooth cog with a round hole — drawn to match the reference mark
 * Ashwani supplied (2026-08-27): teeth at top and bottom plus four diagonals,
 * flat flanks, a generous hole. One component so every settings affordance in
 * the app is recognisably the same control.
 *
 * The light stroke with a round join is what softens the corners; the path
 * itself is straight lines and arcs.
 */

export function GearIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9.11,5.19L9.02,1.62A10.8 10.8 0 0 1 14.98,1.62L14.89,5.19A7.4 7.4 0 0 1 16.45,6.09L16.45,6.09L19.5,4.23A10.8 10.8 0 0 1 22.48,9.39L19.34,11.1A7.4 7.4 0 0 1 19.34,12.9L19.34,12.9L22.48,14.61A10.8 10.8 0 0 1 19.5,19.77L16.45,17.91A7.4 7.4 0 0 1 14.89,18.81L14.89,18.81L14.98,22.38A10.8 10.8 0 0 1 9.02,22.38L9.11,18.81A7.4 7.4 0 0 1 7.55,17.91L7.55,17.91L4.5,19.77A10.8 10.8 0 0 1 1.52,14.61L4.66,12.9A7.4 7.4 0 0 1 4.66,11.1L4.66,11.1L1.52,9.39A10.8 10.8 0 0 1 4.5,4.23L7.55,6.09A7.4 7.4 0 0 1 9.11,5.19ZM12,8.6A3.4 3.4 0 1 0 12,15.4A3.4 3.4 0 1 0 12,8.6Z"
        fill="currentColor"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
