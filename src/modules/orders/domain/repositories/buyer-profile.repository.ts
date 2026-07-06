export const BUYER_PROFILE_REPOSITORY = Symbol('BUYER_PROFILE_REPOSITORY');

export interface BuyerProfileView {
  id: string;
  userId: string;
}

export interface BuyerProfileRepository {
  findByUserId(userId: string): Promise<BuyerProfileView | null>;
  create(profile: { id: string; userId: string }): Promise<BuyerProfileView>;
}
