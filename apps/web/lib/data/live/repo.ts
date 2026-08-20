import { api, type Paginated } from '@/lib/api-client';
import { env } from '@/lib/env';

import type { RoveRepo } from '../repo';
import type { AiJob, Airport, CurrentUser, Member } from '../types';
import type {
  ActivityDto,
  AdminStatsDto,
  AirportDto,
  AiCreditsDto,
  AiJobDto,
  AvailabilityBoardDto,
  BookingDto,
  BudgetDto,
  CalendarTripDto,
  CommentDto,
  CoverageDto,
  DateWindowDto,
  DestinationDto,
  DreamDto,
  ExpenseEntryDto,
  ExpenseSummaryDto,
  InviteDto,
  LockedDatesDto,
  MeDto,
  MemberDto,
  ParsedTicketDto,
  PastTripDto,
  PlanDayDto,
  PlanItemDto,
  PlanVersionDto,
  PoiDto,
  PrepTaskDto,
  RouteDto,
  ShareStateDto,
  TripDto,
  TripOverviewDto,
  TripRecapDto,
  VoteDto,
  WishlistItemDto,
  YearStatsDto,
} from './dto';
import {
  fromBooking,
  fromExpense,
  fromFlightLeg,
  fromPlanItem,
  fromPrepTask,
  fromWishlistItem,
  toActivity,
  toAirport,
  toAiCredits,
  toAiJob,
  toBoard,
  toBooking,
  toBudget,
  toCalendarTrip,
  toComment,
  toCoverage,
  toDestination,
  toDream,
  toExpense,
  toExpenseSummary,
  toInvite,
  toLocked,
  toMember,
  toParsedTicket,
  toPastTrip,
  toPlanDay,
  toPlanItem,
  toPlanVersion,
  toPoi,
  toPrepTask,
  toRoute,
  toShareState,
  toTrip,
  toTripOverview,
  toTripRecap,
  toTripSummary,
  toVote,
  toWishlistItem,
  toWindow,
  toYearStats,
} from './mappers';
import { CHARACTERS } from '@/lib/mock/characters';

/**
 * The live repository — every call reaches the Go API and lands in MySQL.
 *
 * Paths here are the contract `apps/api/pkg/handlers/api/*.handler.go`
 * implements. Nothing is cached at this layer: TanStack Query owns caching.
 */

function toMe(dto: MeDto): CurrentUser {
  return {
    id: dto.id,
    name: dto.display_name,
    handle: dto.handle ?? '',
    characterId: dto.character_id || 'shiba',
    email: dto.email ?? undefined,
    homeCurrency: dto.home_currency,
    isAdmin: dto.role === 'admin',
    points: dto.points,
  };
}

/** Members are needed to label the expense split; fetched alongside it. */
async function membersOf(tripId: string): Promise<Member[]> {
  const dto = await api.get<MemberDto[]>(`/trips/${tripId}/members`);
  return dto.map(toMember);
}

export const liveRepo: RoveRepo = {
  /* -------------------------------------------------------------- auth -- */
  auth: {
    async me() {
      try {
        return toMe(await api.get<MeDto>('/auth/me'));
      } catch {
        // 401 for an anonymous visitor is an answer, not a failure.
        return null;
      }
    },

    async startLogin(provider, next) {
      // Not the provider's URL directly: `/api/auth/start` fetches it, keeps
      // the `state` in an httpOnly cookie so the callback can verify it, and
      // only then hands the browser on. The API cannot hold that state itself.
      const url = new URL('/api/auth/start', env.appUrl);
      url.searchParams.set('provider', provider);
      if (next) url.searchParams.set('next', next);
      return { redirectUrl: `${url.pathname}${url.search}`, user: null };
    },

    async logout() {
      await api.post<void>('/auth/logout');
    },

    async updateMe(patch) {
      const dto = await api.patch<MeDto>('/users/me', {
        display_name: patch.name,
        handle: patch.handle,
        character_id: patch.characterId,
        home_currency: patch.homeCurrency,
      });
      return toMe(dto);
    },
  },

  /* ---------------------------------------------------------- airports -- */
  airports: {
    async search(query, limit) {
      const dtos = await api.get<AirportDto[]>('/airports', {
        searchParams: { q: query, limit: String(limit ?? 8) },
      });
      return dtos.map(toAirport);
    },

    async get(iata) {
      try {
        return toAirport(await api.get<AirportDto>(`/airports/${iata.toUpperCase()}`));
      } catch {
        // An unknown code is an answer, not an error — the picker says so.
        return null;
      }
    },

    // One request per code, in parallel: the route builder never holds more
    // than a handful, and the API caches nothing it would not cache anyway.
    async resolve(codes) {
      const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
      const found = await Promise.all(unique.map((code) => this.get(code)));
      const out: Record<string, Airport> = {};
      found.forEach((airport) => {
        if (airport) out[airport.iata] = airport;
      });
      return out;
    },
  },

  /* ------------------------------------------------------------- trips -- */
  trips: {
    async list() {
      const page = await api.get<Paginated<TripDto>>('/trips');
      return page.items.map(toTripSummary);
    },
    async get(tripId) {
      return toTrip(await api.get<TripDto>(`/trips/${tripId}`));
    },
    async overview(tripId) {
      return toTripOverview(await api.get<TripOverviewDto>(`/trips/${tripId}/overview`));
    },
    async create(input) {
      const dto = await api.post<TripDto>('/trips', {
        entry_type: input.entryType,
        title: input.title,
        destination_cities: input.cities,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
        party_size: input.partySize,
        budget_per_person_thb: input.budgetPerPersonThb,
        coordinate_dates: input.coordinateDates ?? false,
        source_trip_id: input.sourceTripId,
        flights: (input.flights ?? []).map(fromFlightLeg),
      });
      return toTrip(dto);
    },
    async update(tripId, patch) {
      const dto = await api.patch<TripDto>(`/trips/${tripId}`, {
        title: patch.title,
        destination_cities: patch.cities,
        start_date: patch.startDate,
        end_date: patch.endDate,
        party_size: patch.partySize,
        budget_per_person_thb: patch.budgetPerPersonThb,
        status: patch.status,
        cover_image_url: patch.cover,
      });
      return toTrip(dto);
    },
    async remove(tripId) {
      await api.delete<void>(`/trips/${tripId}`);
    },
    async clone(tripId) {
      return toTrip(await api.post<TripDto>(`/trips/${tripId}/clone`));
    },
    async parseTicket(text) {
      return api.post<ParsedTicketDto>('/ai/parse-ticket', { text }).then(toParsedTicket);
    },

    async route(tripId) {
      return toRoute(await api.get<RouteDto>(`/trips/${tripId}/flights`));
    },

    async setRoute(tripId, legs) {
      const dto = await api.put<RouteDto>(`/trips/${tripId}/flights`, {
        flights: legs.map(fromFlightLeg),
      });
      return toRoute(dto);
    },
    async upcoming() {
      return (await api.get<CalendarTripDto[]>('/users/me/trips/upcoming')).map(toCalendarTrip);
    },
    async past() {
      return (await api.get<PastTripDto[]>('/users/me/trips/past')).map(toPastTrip);
    },
    async recap(tripId) {
      return toTripRecap(await api.get<TripRecapDto>(`/trips/${tripId}/recap`));
    },
    async stats() {
      return toYearStats(await api.get<YearStatsDto>('/users/me/stats'));
    },
  },

  /* ----------------------------------------------------------- members -- */
  members: {
    list: membersOf,

    async invite(tripId, role) {
      return toInvite(await api.post<InviteDto>(`/trips/${tripId}/invites`, { role }));
    },
    async join(token) {
      return api.post<{ tripId: string }>(`/invites/${token}/join`).then((r) => r);
    },
    async updateRole(tripId, memberId, role) {
      return toMember(await api.patch<MemberDto>(`/trips/${tripId}/members/${memberId}`, { role }));
    },
    async remove(tripId, memberId) {
      await api.delete<void>(`/trips/${tripId}/members/${memberId}`);
    },
  },

  /* ------------------------------------------------------------- dates -- */
  dates: {
    async board(tripId, month) {
      const dto = await api.get<AvailabilityBoardDto>(`/trips/${tripId}/dates/board`, {
        searchParams: { month },
      });
      return toBoard(dto);
    },

    async setAvailability(tripId, memberId, dates, mark) {
      const dto = await api.put<AvailabilityBoardDto>(`/trips/${tripId}/dates/availability`, {
        user_id: memberId,
        dates,
        mark,
      });
      return toBoard(dto);
    },

    async submit(tripId, memberId) {
      const dto = await api.post<AvailabilityBoardDto>(`/trips/${tripId}/dates/submit`, {
        user_id: memberId,
      });
      return toBoard(dto);
    },

    async windows(tripId) {
      return (await api.get<DateWindowDto[]>(`/trips/${tripId}/dates/windows`)).map(toWindow);
    },

    async lock(tripId, startDate, endDate) {
      const dto = await api.post<LockedDatesDto>(`/trips/${tripId}/dates/lock`, {
        start_date: startDate,
        end_date: endDate,
      });
      return toLocked(dto);
    },

    async unlock(tripId) {
      await api.delete<void>(`/trips/${tripId}/dates/lock`);
    },

    async destinations(tripId) {
      return (await api.get<DestinationDto[]>(`/trips/${tripId}/dates/destinations`)).map(
        toDestination,
      );
    },

    async chooseDestination(tripId, destinationId) {
      return toTrip(
        await api.post<TripDto>(`/trips/${tripId}/dates/destination`, {
          destination_id: destinationId,
        }),
      );
    },
  },

  /* ---------------------------------------------------------- wishlist -- */
  wishlist: {
    async list(tripId) {
      return (await api.get<WishlistItemDto[]>(`/trips/${tripId}/wishlist`)).map(toWishlistItem);
    },
    async coverage(tripId) {
      return toCoverage(await api.get<CoverageDto>(`/trips/${tripId}/coverage`));
    },
    async add(tripId, input) {
      return toWishlistItem(
        await api.post<WishlistItemDto>(`/trips/${tripId}/wishlist`, fromWishlistItem(input)),
      );
    },
    async update(tripId, wishId, patch) {
      return toWishlistItem(
        await api.patch<WishlistItemDto>(
          `/trips/${tripId}/wishlist/${wishId}`,
          fromWishlistItem(patch),
        ),
      );
    },
    async remove(tripId, wishId) {
      await api.delete<void>(`/trips/${tripId}/wishlist/${wishId}`);
    },
  },

  /* -------------------------------------------------------------- plan -- */
  plan: {
    async days(tripId) {
      return (await api.get<PlanDayDto[]>(`/trips/${tripId}/plan/days`)).map(toPlanDay);
    },
    async addItem(tripId, input) {
      return toPlanItem(await api.post<PlanItemDto>(`/trips/${tripId}/items`, fromPlanItem(input)));
    },
    async updateItem(tripId, itemId, patch) {
      return toPlanItem(
        await api.patch<PlanItemDto>(`/trips/${tripId}/items/${itemId}`, fromPlanItem(patch)),
      );
    },
    async moveItem(tripId, input) {
      const dto = await api.post<PlanDayDto[]>(`/trips/${tripId}/items/${input.itemId}/move`, {
        to_day_id: input.toDayId,
        to_index: input.toIndex,
      });
      return dto.map(toPlanDay);
    },
    async removeItem(tripId, itemId) {
      await api.delete<void>(`/trips/${tripId}/items/${itemId}`);
    },
    async revalidate(tripId) {
      return (await api.post<PlanDayDto[]>(`/trips/${tripId}/plan/revalidate`)).map(toPlanDay);
    },
    async undo(tripId) {
      return (await api.post<PlanDayDto[]>(`/trips/${tripId}/plan/undo`)).map(toPlanDay);
    },
    async versions(tripId) {
      const dto = await api.get<PlanVersionDto[]>(`/trips/${tripId}/plan/versions`);
      return dto.map(toPlanVersion);
    },
  },

  /* ------------------------------------------------------------ budget -- */
  budget: {
    async summary(tripId) {
      return toBudget(await api.get<BudgetDto>(`/trips/${tripId}/budget`));
    },
    async setBudget(tripId, perPersonThb) {
      return toBudget(
        await api.put<BudgetDto>(`/trips/${tripId}/budget`, { per_person_thb: perPersonThb }),
      );
    },
    async refreshFx(tripId) {
      return toBudget(await api.post<BudgetDto>(`/trips/${tripId}/budget/fx`));
    },
  },

  /* ----------------------------------------------------------- expense -- */
  expense: {
    async summary(tripId) {
      const [dto, members] = await Promise.all([
        api.get<ExpenseSummaryDto>(`/trips/${tripId}/expenses/summary`),
        membersOf(tripId),
      ]);
      return toExpenseSummary(dto, members);
    },
    async add(tripId, input) {
      return toExpense(
        await api.post<ExpenseEntryDto>(`/trips/${tripId}/expenses`, fromExpense(input)),
      );
    },
    async update(tripId, expenseId, patch) {
      return toExpense(
        await api.patch<ExpenseEntryDto>(`/trips/${tripId}/expenses/${expenseId}`, fromExpense(patch)),
      );
    },
    async remove(tripId, expenseId) {
      await api.delete<void>(`/trips/${tripId}/expenses/${expenseId}`);
    },
    async settle(tripId, fromMemberId, toMemberId) {
      const [dto, members] = await Promise.all([
        api.post<ExpenseSummaryDto>(`/trips/${tripId}/expenses/settle`, {
          from_user_id: fromMemberId,
          to_user_id: toMemberId,
        }),
        membersOf(tripId),
      ]);
      return toExpenseSummary(dto, members);
    },
  },

  /* -------------------------------------------------------------- prep -- */
  prep: {
    async list(tripId) {
      return (await api.get<PrepTaskDto[]>(`/trips/${tripId}/prep`)).map(toPrepTask);
    },
    async add(tripId, input) {
      return toPrepTask(await api.post<PrepTaskDto>(`/trips/${tripId}/prep`, fromPrepTask(input)));
    },
    async toggle(tripId, taskId, done) {
      return toPrepTask(await api.patch<PrepTaskDto>(`/trips/${tripId}/prep/${taskId}`, { done }));
    },
    async update(tripId, taskId, patch) {
      return toPrepTask(
        await api.patch<PrepTaskDto>(`/trips/${tripId}/prep/${taskId}`, fromPrepTask(patch)),
      );
    },
    async remove(tripId, taskId) {
      await api.delete<void>(`/trips/${tripId}/prep/${taskId}`);
    },
    async applyTemplate(tripId) {
      return (await api.post<PrepTaskDto[]>(`/trips/${tripId}/prep/template`)).map(toPrepTask);
    },
    async note(tripId) {
      const { body } = await api.get<{ body: string }>(`/trips/${tripId}/prep/note`);
      return body;
    },
    async saveNote(tripId, body) {
      const saved = await api.put<{ body: string }>(`/trips/${tripId}/prep/note`, { body });
      return saved.body;
    },
  },

  /* ----------------------------------------------------------- booking -- */
  booking: {
    async list(tripId) {
      return (await api.get<BookingDto[]>(`/trips/${tripId}/bookings`)).map(toBooking);
    },
    async offers(tripId, kind) {
      const dto = await api.get<BookingDto[]>(`/trips/${tripId}/bookings/offers`, {
        searchParams: { kind },
      });
      return dto.map(toBooking);
    },
    async save(tripId, input) {
      return toBooking(await api.post<BookingDto>(`/trips/${tripId}/bookings`, fromBooking(input)));
    },
    async setStatus(tripId, bookingId, status) {
      return toBooking(
        await api.patch<BookingDto>(`/trips/${tripId}/bookings/${bookingId}`, { status }),
      );
    },
    async remove(tripId, bookingId) {
      await api.delete<void>(`/trips/${tripId}/bookings/${bookingId}`);
    },
  },

  /* ------------------------------------------------------------ collab -- */
  collab: {
    async comments(tripId, targetType, targetId) {
      const dto = await api.get<CommentDto[]>(`/trips/${tripId}/comments`, {
        searchParams: { target_type: targetType, target_id: targetId },
      });
      return dto.map(toComment);
    },
    async addComment(tripId, targetType, targetId, body) {
      return toComment(
        await api.post<CommentDto>(`/trips/${tripId}/comments`, {
          target_type: targetType,
          target_id: targetId,
          body,
        }),
      );
    },
    async resolveComment(tripId, commentId, resolved) {
      return toComment(
        await api.patch<CommentDto>(`/trips/${tripId}/comments/${commentId}`, { resolved }),
      );
    },
    async votes(tripId, targetType, targetId) {
      const dto = await api.get<VoteDto[]>(`/trips/${tripId}/votes`, {
        searchParams: { target_type: targetType, target_id: targetId },
      });
      return dto.map(toVote);
    },
    async vote(tripId, targetType, targetId, value) {
      const dto = await api.post<VoteDto[]>(`/trips/${tripId}/votes`, {
        target_type: targetType,
        target_id: targetId,
        value,
      });
      return dto.map(toVote);
    },
    async activity(tripId) {
      return (await api.get<ActivityDto[]>(`/trips/${tripId}/activity`)).map(toActivity);
    },
  },

  /* ---------------------------------------------------------------- ai -- */
  ai: {
    async credits(tripId) {
      return toAiCredits(await api.get<AiCreditsDto>(`/trips/${tripId}/ai/credits`));
    },

    async generate(tripId, input) {
      const dto = await api.post<AiJobDto>(`/trips/${tripId}/ai/generate`, {
        kind: input.kind,
        brief: input.brief,
        pace: input.pace,
        focus: input.focus,
      });
      return toAiJob(dto);
    },

    async job(tripId, jobId) {
      return toAiJob(await api.get<AiJobDto>(`/trips/${tripId}/ai/jobs/${jobId}`));
    },

    subscribe(tripId, jobId, onUpdate) {
      const source = new EventSource(
        `${env.apiUrl}/api/v1/trips/${tripId}/ai/jobs/${jobId}/stream`,
        { withCredentials: true },
      );

      source.onmessage = (message) => {
        try {
          onUpdate(toAiJob(JSON.parse(message.data) as AiJobDto));
        } catch {
          // A malformed frame must never take the stream down.
        }
      };

      // The job may already be finished when the stream opens; one poll covers
      // that race without waiting for a heartbeat.
      void api
        .get<AiJobDto>(`/trips/${tripId}/ai/jobs/${jobId}`)
        .then((dto) => {
          const job: AiJob = toAiJob(dto);
          if (job.status === 'done' || job.status === 'failed') onUpdate(job);
        })
        .catch(() => undefined);

      return () => source.close();
    },

    async apply(tripId, jobId) {
      const dto = await api.post<PlanDayDto[]>(`/trips/${tripId}/ai/jobs/${jobId}/apply`);
      return dto.map(toPlanDay);
    },

    async buyCredits(tripId, quantity, channel) {
      const dto = await api.post<AiCreditsDto & { simulated: boolean }>(
        `/trips/${tripId}/ai/credits/purchase`,
        { quantity, channel },
      );
      return { ...toAiCredits(dto), simulated: dto.simulated };
    },
  },

  /* ------------------------------------------------------------- share -- */
  share: {
    async state(tripId) {
      return toShareState(await api.get<ShareStateDto>(`/trips/${tripId}/share`));
    },
    async setVisibility(tripId, visibility) {
      return toShareState(
        await api.patch<ShareStateDto>(`/trips/${tripId}/visibility`, { visibility }),
      );
    },
    async rotateToken(tripId) {
      return toShareState(await api.post<ShareStateDto>(`/trips/${tripId}/share/rotate`));
    },
    async exportTrip(tripId, format) {
      // The API streams the file with a Content-Disposition header rather than
      // uploading it somewhere and handing back a signed link, so there is
      // nothing to await here: the URL *is* the export.
      const url = new URL(`/api/v1/trips/${tripId}/export`, env.apiUrl);
      url.searchParams.set('format', format);
      return {
        format,
        url: url.toString(),
        filename: `${tripId}.${format === 'pdf' ? 'html' : format}`,
        simulated: false,
      };
    },
    async publicTrip(tokenOrSlug) {
      try {
        const dto = await api.get<{ trip: TripDto; days: PlanDayDto[]; members: MemberDto[] }>(
          `/public/trips/${tokenOrSlug}`,
        );
        return {
          trip: toTrip(dto.trip),
          days: (dto.days ?? []).map(toPlanDay),
          members: (dto.members ?? []).map(toMember),
        };
      } catch {
        return null;
      }
    },
  },

  /* --------------------------------------------------------------- poi -- */
  poi: {
    async search(query, city) {
      const dto = await api.get<PoiDto[]>('/poi/search', { searchParams: { q: query, city } });
      return dto.map(toPoi);
    },
    async get(poiId) {
      try {
        return toPoi(await api.get<PoiDto>(`/poi/${poiId}`));
      } catch {
        return null;
      }
    },
  },

  /* ------------------------------------------------------------- admin -- */
  admin: {
    async stats() {
      const dto = await api.get<AdminStatsDto>('/admin/stats');
      return {
        users: dto.users,
        trips: dto.trips,
        pois: dto.pois,
        characters: dto.characters,
        aiCostTodayUsd: dto.ai_cost_today_usd,
        aiCostCapUsd: dto.ai_cost_cap_usd,
        clicksToday: dto.clicks_today,
        mockMode: dto.mock_mode,
        commit: dto.commit,
      };
    },
  },

  /* ----------------------------------------------------------- profile -- */
  profile: {
    async characters() {
      // The character set is a static asset shipped with the web app; the API
      // only stores which one a user picked.
      return CHARACTERS;
    },
    async dreams() {
      return (await api.get<DreamDto[]>('/users/me/dreams')).map(toDream);
    },
    async addDream(input) {
      return toDream(
        await api.post<DreamDto>('/users/me/dreams', {
          title: input.title,
          destination: input.destination,
          note: input.note,
          url: input.url,
          accent: input.accent,
        }),
      );
    },
    async removeDream(dreamId) {
      await api.delete<void>(`/users/me/dreams/${dreamId}`);
    },
  },
};
