import { api, type Paginated } from '@/lib/api-client';
import { env } from '@/lib/env';

import type { RoveRepo } from '../repo';
import type {
  AdaptInput,
  AdminStats,
  AiJob,
  Airport,
  CurrentUser,
  Member,
  PhotoBookTheme,
  ProviderMode,
  TripConflict,
} from '../types';
import type {
  ActivityDto,
  AdaptCloneDto,
  DiscountCodeDto,
  EarningsDto,
  LeadDto,
  RedemptionListDto,
  ReviewListDto,
  AdaptDiffDto,
  AdminStatsDto,
  ModeDto,
  AirportDto,
  AiCreditsDto,
  AiJobDto,
  AvailabilityBoardDto,
  BillingSummaryDto,
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
  InvitePreviewDto,
  LockedDatesDto,
  MeDto,
  MemberDto,
  CreatorProfileDto,
  DocumentDto,
  ExploreTripDto,
  InboxDto,
  PollDto,
  PhotoDto,
  MemberProfileDto,
  OrderDto,
  PublicTripDto,
  VariantDto,
  VariantListDto,
  VariantVotesDto,
  ParsedTicketDto,
  PastTripDto,
  AudienceDto,
  PlatformStatsDto,
  PointsLedgerDto,
  PublicReviewDto,
  PlanDayDto,
  PlanItemDto,
  PlanVersionDto,
  PoiDto,
  PrepTaskDto,
  RouteDto,
  ShareStateDto,
  SubscriptionDto,
  SubscriptionPlanDto,
  TripDto,
  TripOverviewDto,
  TripRecapDto,
  VoteDto,
  WishlistItemDto,
  YearStatsDto,
} from './dto';
import {
  fromBooking,
  toAdaptDiff,
  toAudienceSummary,
  toDiscountCode,
  toPlatformStats,
  toPointsLedger,
  toPublicReview,
  toEarningsStatement,
  toLead,
  toRedemptionBoard,
  toReview,
  toReviewBoard,
  toReviewSummary,
  fromExpense,
  fromFlightLeg,
  fromPlanItem,
  fromPrepTask,
  fromWishlistItem,
  toActivity,
  toAirport,
  toAiCredits,
  toAiJob,
  toBillingSummary,
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
  toInvitePreview,
  toLocked,
  toMember,
  toCreatorProfile,
  toDocument,
  toExploreTrip,
  toInbox,
  toPoll,
  toPhoto,
  toMemberProfile,
  toOrder,
  toPublicCreator,
  toVariant,
  toVariantList,
  toParsedTicket,
  toPastTrip,
  toPlanDay,
  toPlanItem,
  toPlanVersion,
  toPoi,
  toPrepTask,
  toRoute,
  toShareState,
  toSubscription,
  toSubscriptionPlan,
  toTrip,
  toTripOverview,
  toTripRecap,
  toTripSummary,
  toVote,
  toWishlistItem,
  toWindow,
  toYearStats,
} from './mappers';
import { CHARACTERS } from '@/lib/catalog/characters';

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
    async preview(token) {
      return toInvitePreview(await api.get<InvitePreviewDto>(`/invites/${token}`));
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

    async myProfile(tripId) {
      return toMemberProfile(await api.get<MemberProfileDto>(`/trips/${tripId}/profile/me`));
    },
    async saveProfile(tripId, input) {
      return toMemberProfile(
        await api.put<MemberProfileDto>(`/trips/${tripId}/profile/me`, {
          visited_before: input.visitedBefore,
          pace: input.pace,
          walk_level: input.walkLevel,
          can_drive: input.canDrive,
          has_idp: input.hasIdp,
          budget_min_thb: input.budgetMinThb,
          budget_max_thb: input.budgetMaxThb,
          dietary: input.dietary,
          notes: input.notes,
        }),
      );
    },
    async profiles(tripId) {
      const dto = await api.get<MemberProfileDto[]>(`/trips/${tripId}/profiles`);
      return dto.map(toMemberProfile);
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

    /* ------------------------------------------- variants & compare (M6) */

    async variants(tripId) {
      return toVariantList(await api.get<VariantListDto>(`/trips/${tripId}/variants`));
    },
    async forkVariant(tripId, input) {
      return toVariant(
        await api.post<VariantDto>(`/trips/${tripId}/variants`, {
          label: input.label,
          key_decision: input.keyDecision,
        }),
      );
    },
    async generateVariants(tripId, input) {
      return toAiJob(
        await api.post<AiJobDto>(`/trips/${tripId}/variants/generate`, {
          count: input.count,
          brief: input.brief,
        }),
      );
    },
    async voteVariant(tripId, variantId, value) {
      const dto = await api.post<VariantVotesDto>(`/trips/${tripId}/variants/${variantId}/vote`, {
        value,
      });
      return { up: dto.up, down: dto.down, mine: dto.mine > 0 ? 1 : dto.mine < 0 ? -1 : 0 };
    },
    async adoptVariant(tripId, variantId) {
      const dto = await api.post<PlanDayDto[]>(`/trips/${tripId}/variants/${variantId}/adopt`);
      return dto.map(toPlanDay);
    },
    async removeVariant(tripId, variantId) {
      await api.delete<void>(`/trips/${tripId}/variants/${variantId}`);
    },
    async freeze(tripId) {
      return toTrip(await api.post<TripDto>(`/trips/${tripId}/plan/freeze`));
    },
    async unfreeze(tripId) {
      return toTrip(await api.delete<TripDto>(`/trips/${tripId}/plan/freeze`));
    },
    async conflicts(tripId) {
      return api.get<TripConflict[]>(`/trips/${tripId}/conflicts`);
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

    async buyPass(tripId, input) {
      const dto = await api.post<AiCreditsDto & { simulated: boolean; order?: OrderDto }>(
        `/trips/${tripId}/pass`,
        {
          method: input.method,
          channel: input.channel,
          discount_code: input.discountCode ?? '',
        },
      );
      // A trip that was already unlocked answers with the state and no receipt
      // rather than an error — two people in a room tapping pay at the same
      // second is the normal case, not a fault.
      return {
        ...toAiCredits(dto),
        simulated: dto.simulated,
        order: dto.order ? toOrder(dto.order) : null,
      };
    },
  },

  /* ----------------------------------------------------------- billing -- */
  billing: {
    async summary() {
      return toBillingSummary(await api.get<BillingSummaryDto>('/users/me/billing/summary'));
    },
    async orders() {
      return (await api.get<OrderDto[]>('/users/me/billing/orders')).map(toOrder);
    },
    async order(orderId) {
      try {
        return toOrder(await api.get<OrderDto>(`/users/me/billing/orders/${orderId}`));
      } catch {
        // A receipt that is not this user's is a 404 to them, not an error the
        // screen has to explain.
        return null;
      }
    },
    async subscription() {
      return toSubscription(await api.get<SubscriptionDto>('/users/me/billing/subscription'));
    },
    async plans() {
      return (await api.get<SubscriptionPlanDto[]>('/users/me/billing/plans')).map(
        toSubscriptionPlan,
      );
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
        const dto = await api.get<PublicTripDto>(`/public/trips/${tokenOrSlug}`);
        return {
          trip: toTrip(dto.trip),
          days: (dto.days ?? []).map(toPlanDay),
          members: (dto.members ?? []).map(toMember),
          creator: toPublicCreator(dto.creator),
          viewCount: dto.view_count,
          cloneCount: dto.clone_count,
          reviews: toReviewSummary(dto.reviews),
          reviewEntries: (dto.review_entries ?? []).map(toReview),
        };
      } catch {
        return null;
      }
    },

    /* --------------------------------------------- public model (M11) -- */

    async explore(filters) {
      const dto = await api.get<{ items: ExploreTripDto[]; total: number }>('/public/explore', {
        searchParams: {
          q: filters.q,
          country: filters.country,
          sort: filters.sort,
          match: filters.match,
          limit: filters.limit != null ? String(filters.limit) : undefined,
          offset: filters.offset != null ? String(filters.offset) : undefined,
        },
      });
      return { items: (dto.items ?? []).map(toExploreTrip), total: dto.total };
    },

    async creator(handle) {
      try {
        return toCreatorProfile(await api.get<CreatorProfileDto>(`/public/creators/${handle}`));
      } catch {
        return null;
      }
    },

    async cloneFromPublic(tokenOrSlug) {
      return toTrip(await api.post<TripDto>(`/public/trips/${tokenOrSlug}/clone`));
    },

    async adaptPreview(tokenOrSlug, input) {
      return toAdaptDiff(
        await api.post<AdaptDiffDto>(
          `/public/trips/${tokenOrSlug}/adapt/preview`,
          adaptBody(input),
        ),
      );
    },

    async cloneAdapted(tokenOrSlug, input) {
      const dto = await api.post<AdaptCloneDto>(
        `/public/trips/${tokenOrSlug}/adapt`,
        adaptBody(input),
      );
      return { trip: toTrip(dto.trip), diff: toAdaptDiff(dto.diff) };
    },

    /* ------------------------------------ platform social proof (M24) -- */

    async platformStats() {
      return toPlatformStats(await api.get<PlatformStatsDto>('/public/stats'));
    },

    async recentReviews() {
      const dto = await api.get<{ items: PublicReviewDto[] }>('/public/reviews/recent');
      return (dto.items ?? []).map(toPublicReview);
    },
  },

  /* ----------------------------- points out, money owed (M22) -- */
  rewards: {
    async redemptions() {
      return toRedemptionBoard(await api.get<RedemptionListDto>('/users/me/points/redemptions'));
    },

    async redeem(amountThb) {
      return toDiscountCode(
        await api.post<DiscountCodeDto>('/users/me/points/redeem', { amount_thb: amountThb }),
      );
    },

    async earnings() {
      return toEarningsStatement(await api.get<EarningsDto>('/users/me/earnings'));
    },

    /* ------------------------------- where the points came from (M23) -- */

    async pointsHistory(cursor) {
      return toPointsLedger(
        await api.get<PointsLedgerDto>('/users/me/points', {
          searchParams: { cursor: cursor || undefined },
        }),
      );
    },

    async audience() {
      return toAudienceSummary(await api.get<AudienceDto>('/users/me/audience'));
    },
  },

  leads: {
    async list(tripId) {
      const dto = await api.get<LeadDto[]>(`/trips/${tripId}/leads`);
      return dto.map(toLead);
    },

    async create(tripId, input) {
      return toLead(
        await api.post<LeadDto>(`/trips/${tripId}/leads`, {
          contact_name: input.contactName,
          contact_phone: input.contactPhone ?? '',
          contact_line: input.contactLine ?? '',
          note: input.note ?? '',
        }),
      );
    },
  },

  /* ----------------------------------------------- reviews (M21) -- */
  reviews: {
    async list(tripId) {
      return toReviewBoard(await api.get<ReviewListDto>(`/trips/${tripId}/reviews`));
    },

    async save(tripId, input) {
      return toReviewBoard(
        await api.put<ReviewListDto>(`/trips/${tripId}/reviews/me`, {
          rating: input.rating,
          actual_budget_per_person: input.actualBudgetPerPerson ?? 0,
          body: input.body ?? '',
        }),
      );
    },

    async remove(tripId) {
      await api.delete<void>(`/trips/${tripId}/reviews/me`);
    },
  },

  /* ------------------------------------------------ photos (M18) -- */
  photos: {
    async list(tripId, filter) {
      const dto = await api.get<PhotoDto[]>(`/trips/${tripId}/photos`, {
        searchParams: {
          day_id: filter?.dayId,
          item_id: filter?.itemId,
          user_id: filter?.userId,
        },
      });
      return dto.map(toPhoto);
    },

    async upload(tripId, input) {
      const form = new FormData();
      form.append('image', input.file);
      if (input.dayId) form.append('day_id', input.dayId);
      if (input.itemId) form.append('item_id', input.itemId);
      if (input.caption) form.append('caption', input.caption);
      return toPhoto(await api.upload<PhotoDto>(`/trips/${tripId}/photos`, form));
    },

    async remove(tripId, photoId) {
      await api.delete<void>(`/trips/${tripId}/photos/${photoId}`);
    },

    async photoBookThemes(tripId) {
      return api.get<PhotoBookTheme[]>(`/trips/${tripId}/photobook/themes`);
    },

    photoBookUrl(tripId, options) {
      // Rendered server-side as a self-contained page the user prints —
      // opened in a tab, not fetched, so it is a URL and not a request.
      const url = new URL(`/api/v1/trips/${tripId}/photobook`, env.apiUrl);
      if (options?.theme) url.searchParams.set('theme', options.theme);
      if (options?.coverPhotoId) url.searchParams.set('cover', options.coverPhotoId);
      return url.toString();
    },
  },

  /* --------------------------------------------- documents (M19) -- */
  documents: {
    async list(tripId) {
      return (await api.get<DocumentDto[]>(`/trips/${tripId}/documents`)).map(toDocument);
    },

    async upload(tripId, input) {
      const form = new FormData();
      form.append('file', input.file);
      form.append('name', input.name);
      form.append('category', input.category);
      return toDocument(await api.upload<DocumentDto>(`/trips/${tripId}/documents`, form));
    },

    async remove(tripId, documentId) {
      await api.delete<void>(`/trips/${tripId}/documents/${documentId}`);
    },
  },

  /* --------------------------------------------- community (M9) -- */
  community: {
    async inbox() {
      return toInbox(await api.get<InboxDto>('/users/me/notifications'));
    },
    async markRead(notificationId) {
      return toInbox(
        await api.post<InboxDto>('/users/me/notifications/read', {
          notification_id: notificationId ?? '',
        }),
      );
    },

    async polls(tripId) {
      return (await api.get<PollDto[]>(`/trips/${tripId}/polls`)).map(toPoll);
    },
    async createPoll(tripId, input) {
      return toPoll(
        await api.post<PollDto>(`/trips/${tripId}/polls`, {
          question: input.question,
          options: input.options,
          item_id: input.itemId,
        }),
      );
    },
    async answerPoll(tripId, pollId, option) {
      return toPoll(await api.post<PollDto>(`/trips/${tripId}/polls/${pollId}/answer`, { option }));
    },
    async closePoll(tripId, pollId) {
      return toPoll(await api.post<PollDto>(`/trips/${tripId}/polls/${pollId}/close`));
    },
    async removePoll(tripId, pollId) {
      await api.delete<void>(`/trips/${tripId}/polls/${pollId}`);
    },

    async ping(tripId, state) {
      // Fire and forget: a dropped heartbeat costs nothing, and a failed one
      // must never surface as an error over the thing the user was doing.
      try {
        await api.post<void>(`/trips/${tripId}/presence`, {
          typing: state.typing,
          tab: state.tab,
        });
      } catch {
        // Ignored on purpose.
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
        stubProviders: dto.stub_providers,
        stubbed: (dto.stubbed ?? []) as AdminStats['stubbed'],
        commit: dto.commit,
      };
    },
  },

  /* -------------------------------------------------------------- meta -- */
  meta: {
    async mode() {
      const dto = await api.get<ModeDto>('/meta/mode');
      return {
        live: dto.live,
        stubbed: (dto.stubbed ?? []) as ProviderMode['stubbed'],
        devLogin: dto.dev_login,
        env: dto.env,
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

/**
 * A zero on the wire means "keep what the source had", so unset fields are
 * omitted rather than sent as 0 — which the API would read as an instruction.
 */
function adaptBody(input: AdaptInput) {
  return {
    days: input.days,
    party_size: input.partySize,
    budget_per_person_thb: input.budgetPerPersonThb,
    start_date: input.startDate,
  };
}
