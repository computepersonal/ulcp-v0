/** Hand-offs from the staff POS to the onboarding app (same origin, served under /onboarding/). */
export const ONBOARDING = {
  home: '/onboarding/',
  register: '/onboarding/register',
  invite: (token: string) => `/onboarding/invite/${token}`,
} as const;

export function goToOnboarding(path: string = ONBOARDING.home): void {
  window.location.assign(path);
}
