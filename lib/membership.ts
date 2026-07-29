export const MEMBERSHIP_TIERS = {
  free: {
    dailyLimit: 10,
    versions: 3,
    inputChars: 4000,
    historyItems: 30,
    advancedControls: false,
    batchExport: false,
    premiumModel: true,
    externalAIDailyLimit: 10,
  },
  member: {
    dailyLimit: 100,
    versions: 6,
    inputChars: 12000,
    historyItems: 100,
    advancedControls: true,
    batchExport: true,
    premiumModel: true,
    externalAIDailyLimit: 100,
  },
} as const;

export function hasActiveMembership(plan: string | null | undefined, expiresAt: number | null | undefined, now = Date.now()) {
  return Boolean(plan && plan !== "free" && (!expiresAt || expiresAt > now));
}

export function capabilitiesFor(premiumAccess: boolean, premiumModelConfigured: boolean) {
  const tier = premiumAccess ? MEMBERSHIP_TIERS.member : MEMBERSHIP_TIERS.free;
  return { ...tier, premiumModel: premiumModelConfigured };
}
