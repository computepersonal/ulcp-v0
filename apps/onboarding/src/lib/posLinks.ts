/** Hand-offs from onboarding to the staff POS app (same origin, different app). */
export const POS = {
  login: '/login',
  setup: '/setup',
  floorMap: '/floor-map',
  catalogue: '/catalogue',
  staff: '/staff',
} as const;

export function goToPos(path: string): void {
  window.location.assign(path);
}
