package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// เก็บเข้าคลัง instead of delete (Feedback #4 — D-18, D-31 … D-34, D-41).
//
// Every trip goes to the คลัง first. Only one that never produced a point or a
// baht can then be deleted for good; anything the evidence chain points at stays
// traceable forever.

type archiveConflictDTO struct {
	Error      string `json:"error"`
	Archivable bool   `json:"archivable"`
	// Tied is true when points or money trace back to it (D-18).
	Tied bool `json:"tied"`
}

func (s *Server) handleArchiveTrip(c echo.Context) error {
	ctx := c.Request().Context()
	userID := request.UserID(c)

	trip, err := s.trips.GetByID(ctx, request.TripID(c))
	if err != nil {
		return request.NotFound(c, "ไม่พบทริป")
	}

	// D-33: archiving closes every way in from outside. Restoring does not
	// reopen them — publishing is a choice the owner makes again.
	if trip.Visibility != models.VisibilityPrivate || trip.Slug != nil || trip.ShareToken != nil {
		trip.Visibility = models.VisibilityPrivate
		trip.Slug = nil
		trip.ShareToken = nil
		if err := s.trips.Update(ctx, trip); err != nil {
			return request.Internal(c, "ปิดการแชร์ไม่สำเร็จ")
		}
	}

	now := time.Now().UTC()
	if err := s.trips.SetArchived(ctx, trip.ID, &now, &userID); err != nil {
		return request.Internal(c, "เก็บเข้าคลังไม่สำเร็จ")
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) handleRestoreTrip(c echo.Context) error {
	if err := s.trips.SetArchived(c.Request().Context(), request.TripID(c), nil, nil); err != nil {
		return request.Internal(c, "กู้คืนไม่สำเร็จ")
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) handleDeleteTrip(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	archived, err := s.trips.IsArchived(ctx, tripID)
	if err != nil {
		return request.Internal(c, "อ่านทริปไม่สำเร็จ")
	}
	tied, err := s.ledger.TripTied(ctx, tripID)
	if err != nil {
		return request.Internal(c, "ตรวจประวัติแต้มและรายได้ไม่สำเร็จ")
	}
	if tied {
		return c.JSON(http.StatusConflict, archiveConflictDTO{
			Error:      "ทริปนี้เคยทำให้เกิดแต้มหรือรายได้ ลบไม่ได้ เก็บเข้าคลังแทน",
			Archivable: !archived,
			Tied:       true,
		})
	}
	if !archived {
		return c.JSON(http.StatusConflict, archiveConflictDTO{
			Error:      "เก็บทริปเข้าคลังก่อน แล้วค่อยลบถาวรจากคลัง",
			Archivable: true,
		})
	}

	if err := s.trips.Delete(ctx, tripID); err != nil {
		return request.Internal(c, "ลบทริปไม่สำเร็จ")
	}
	return c.NoContent(http.StatusNoContent)
}

type archivedTripDTO struct {
	tripDTO
	ArchivedAt string `json:"archived_at"`
	CanDelete  bool   `json:"can_delete"`
}

// handleMyArchive is the คลังทริป on the profile (D-31): the trips this user
// owns and put away.
func (s *Server) handleMyArchive(c echo.Context) error {
	ctx := c.Request().Context()
	trips, err := s.trips.ListArchivedOwned(ctx, request.UserID(c))
	if err != nil {
		return request.Internal(c, "โหลดคลังไม่สำเร็จ")
	}

	out := make([]archivedTripDTO, 0, len(trips))
	for _, trip := range trips {
		tied, err := s.ledger.TripTied(ctx, trip.ID)
		if err != nil {
			return request.Internal(c, "ตรวจประวัติแต้มและรายได้ไม่สำเร็จ")
		}
		row := archivedTripDTO{tripDTO: toTripDTO(trip), CanDelete: !tied}
		if trip.ArchivedAt != nil {
			row.ArchivedAt = trip.ArchivedAt.UTC().Format(time.RFC3339)
		}
		out = append(out, row)
	}
	return c.JSON(http.StatusOK, out)
}

/* ------------------------------------------------------------ bookings --- */

func (s *Server) handleListArchivedBookings(c echo.Context) error {
	ctx := c.Request().Context()
	bookings, err := s.bookings.ListArchived(ctx, request.TripID(c))
	if err != nil {
		return request.Internal(c, "โหลดการจองไม่สำเร็จ")
	}
	out, err := s.bookingDTOs(ctx, bookings)
	if err != nil {
		return request.Internal(c, "โหลดการจองไม่สำเร็จ")
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleArchiveBooking(c echo.Context) error {
	return s.setBookingArchived(c, true)
}

func (s *Server) handleRestoreBooking(c echo.Context) error {
	return s.setBookingArchived(c, false)
}

func (s *Server) setBookingArchived(c echo.Context, archive bool) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)
	bookingID := c.Param("bookingId")

	if _, err := s.bookings.Get(ctx, tripID, bookingID); err != nil {
		return request.NotFound(c, "ไม่พบการจองนี้")
	}

	var at *time.Time
	var by *string
	if archive {
		now := time.Now().UTC()
		userID := request.UserID(c)
		at, by = &now, &userID
	}
	if err := s.bookings.SetArchived(ctx, tripID, bookingID, at, by); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	s.track(c, tripID, "", events.TypeBookingChanged, "booking", bookingID)
	return c.NoContent(http.StatusNoContent)
}

// bookingDTOs marks which bookings a partner confirmation points at, so the
// screen offers "เก็บเข้าคลัง" instead of a delete that would be refused.
func (s *Server) bookingDTOs(ctx contextT, bookings []models.Booking) ([]bookingDTO, error) {
	ids := make([]string, 0, len(bookings))
	for _, b := range bookings {
		ids = append(ids, b.ID)
	}
	tied, err := s.ledger.TiedBookingIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]bookingDTO, 0, len(bookings))
	for _, b := range bookings {
		dto := toBookingDTO(b)
		dto.Tied = tied[b.ID]
		dto.ArchivedAt = timeString(b.ArchivedAt)
		out = append(out, dto)
	}
	return out, nil
}
