/** Stored on the user profile (English slugs); UI labels come from i18n in the same order. */
export const ONBOARDING_INTEREST_KEYS = [
  "news",
  "food_dining",
  "events",
  "entertainment",
  "sports",
  "lifestyle",
  "places",
  "nightlife",
  "videos",
  "trends",
] as const;

export type OnboardingInterestKey = (typeof ONBOARDING_INTEREST_KEYS)[number];
