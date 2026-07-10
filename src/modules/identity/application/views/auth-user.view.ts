import { UserRole, UserStatus } from '../../domain/entities/user.entity';

/** Vista publicada del User para otros módulos (nunca expone passwordHash). */
export interface AuthUserView {
  id: string;
  email: string;
  roles: UserRole[];
  status: UserStatus;
  firstName: string | null;
  phone: string | null;
  /** Modelo hub: Bringo requiere nombre + teléfono antes de operar. */
  hasCompleteProfile: boolean;
}
