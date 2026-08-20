import { api, type Paginated } from '@/lib/api-client';
import type {
  ActivityLog,
  Collection,
  InvitePreview,
  MemberView,
  PublicUser,
  Trip,
  TripOverview,
  TripRole,
} from '@/types/api';

/** Thin fetchers. No caching, no React — that belongs in queries.ts. */

export interface CreateTripInput {
  entry_type: 'date' | 'city' | 'ticket' | 'clone';
  title?: string;
  start_date?: string;
  end_date?: string;
  cities?: string[];
  party_size?: number;
  source_trip_id?: string;
  flights?: Array<{
    direction: 'out' | 'return';
    airline?: string;
    flight_no?: string;
    dep_airport?: string;
    arr_airport?: string;
    dep_at?: string;
    arr_at?: string;
  }>;
}

export type UpdateTripInput = Partial<
  Pick<CreateTripInput, 'title' | 'start_date' | 'end_date' | 'cities' | 'party_size'>
> & { summary?: string; status?: Trip['status'] };

export const tripApi = {
  list: (page = 1) => api.get<Paginated<Trip>>('/trips', { searchParams: { page } }),
  overview: (tripId: string) => api.get<TripOverview>(`/trips/${tripId}`),
  create: (input: CreateTripInput) => api.post<Trip>('/trips', input),
  update: (tripId: string, patch: UpdateTripInput) => api.patch<Trip>(`/trips/${tripId}`, patch),
  remove: (tripId: string) => api.delete<void>(`/trips/${tripId}`),

  saveFlights: (tripId: string, flights: CreateTripInput['flights']) =>
    api.post<{ flights: TripOverview['flights'] }>(`/trips/${tripId}/flights`, { flights }),

  setVisibility: (tripId: string, visibility: Trip['visibility']) =>
    api.patch<{ visibility: Trip['visibility']; share_token: string | null; slug: string | null; share_url: string }>(
      `/trips/${tripId}/visibility`,
      { visibility },
    ),

  clone: (tripId: string) => api.post<{ trip: Trip }>(`/trips/${tripId}/clone`),

  members: (tripId: string) => api.get<Collection<MemberView>>(`/trips/${tripId}/members`),
  setRole: (tripId: string, userId: string, role: TripRole) =>
    api.patch<{ user_id: string; role: TripRole }>(`/trips/${tripId}/members/${userId}`, { role }),
  removeMember: (tripId: string, userId: string) =>
    api.delete<void>(`/trips/${tripId}/members/${userId}`),

  createInvite: (tripId: string, body: { role?: TripRole; expire_in_days?: number; email?: string }) =>
    api.post<{ invite_url: string }>(`/trips/${tripId}/invites`, body),
  previewInvite: (token: string) => api.get<InvitePreview>(`/invites/${token}`),
  acceptInvite: (token: string) =>
    api.post<{ trip_id: string; role: TripRole; already_member: boolean }>(`/invites/${token}/accept`),

  activity: (tripId: string, cursor?: string) =>
    api.get<{ items: ActivityLog[]; actors: Record<string, PublicUser>; next_cursor: string }>(
      `/trips/${tripId}/activity`,
      { searchParams: { cursor, limit: 30 } },
    ),

  export: (tripId: string, format: 'html' | 'pdf', planId?: string) =>
    api.post<{ url: string; format: string; expires_in: number }>(`/trips/${tripId}/export`, {
      format,
      plan_id: planId,
    }),
};
