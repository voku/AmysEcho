import type { Request } from 'express';

export function isProfileAuthorized(req: Request, profileId: string): boolean {
  const claimed = req.header('x-profile-id');

  if (!profileId || typeof profileId !== 'string' || profileId.trim() === '') {
    return false;
  }

  return typeof claimed === 'string' && claimed.trim() === profileId.trim() && claimed.length > 0;
}
