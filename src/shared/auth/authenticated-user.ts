export type Role = 'BUYER' | 'TRAVELER' | 'ADMIN';

/** Usuario autenticado adjuntado a la request por JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: Role[];
  status: 'ACTIVE' | 'SUSPENDED';
}
