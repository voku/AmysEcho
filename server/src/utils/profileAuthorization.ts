import type { Request } from 'express';

export function isProfileAuthorized(
  req: Request,
  profileId: string,
): boolean {
  const claimed = req.header('x-profile-id');

  if (!profileId || typeof profileId !== 'string' || profileId.trim() === '') {
    return false;
  }

  if (typeof claimed !== 'string' || claimed.trim().length === 0) {
    return false;
  }
  const normalized = claimed.trim();
  return normalized === profileId.trim();
}
