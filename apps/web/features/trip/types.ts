/** Mirrors the Go DTOs exactly — snake_case, no renaming in transit. */

export type TripVisibility = 'private' | 'link' | 'public';
export type TripStatus = 'draft' | 'planning' | 'final' | 'done';
export type TripRole = 'owner' | 'editor' | 'viewer';

export interface Trip {
  id: string;
  owner_id: string;
  title: string;
  slug: string | null;
  destination_country: string;
  destination_cities: string[] | null;
  start_date: string | null;
  end_date: string | null;
  party_size: number;
  home_currency: string;
  dest_currency: string;
  fx_rate: number | null;
  visibility: TripVisibility;
  status: TripStatus;
  cover_image_url: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  trip_id: string;
  user_id: string;
  role: TripRole;
  joined_at: string;
}

/** What the overview tab renders in one request. */
export interface TripOverview {
  trip: Trip;
  members: TripMember[];
  counts: {
    wishlist_items: number;
    plans: number;
    members_without_wishlist: number;
  };
  flags: {
    has_flights: boolean;
    has_plan: boolean;
  };
}

export type EntryType = 'date' | 'city' | 'ticket' | 'clone';

export interface CreateTripInput {
  entry_type: EntryType;
  title?: string;
  start_date?: string;
  end_date?: string;
  cities?: string[];
  party_size?: number;
}
