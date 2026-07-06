export const TRAVELER_PROFILE_REPOSITORY = Symbol('TRAVELER_PROFILE_REPOSITORY');

export interface TravelerProfileView {
  id: string;
  userId: string;
  reputationScore: number;
  reputationCount: number;
}

export interface TravelerProfileRepository {
  findByUserId(userId: string): Promise<TravelerProfileView | null>;
  findById(id: string): Promise<TravelerProfileView | null>;
  create(profile: { id: string; userId: string }): Promise<TravelerProfileView>;
}
