import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'required_permission';

/**
 * Decorator to require specific API key permissions on endpoints.
 * If no permissions are set on the API key, ALL access is granted (backward compatible).
 *
 * @param permission - The permission required (e.g., 'read', 'write', 'delete')
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
