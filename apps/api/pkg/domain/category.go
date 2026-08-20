package domain

// Budget and expense both group money by category, but an itinerary item is
// typed by what it IS (a place, a meal, a hotel), not by what it costs. This is
// the one mapping between the two vocabularies.

// Budget/expense categories.
const (
	CategoryFood      = "food"
	CategoryStay      = "stay"
	CategoryTransport = "transport"
	CategoryTicket    = "ticket"
	CategoryShopping  = "shopping"
	CategoryOther     = "other"
)

// itemTypeToCategory maps models.ItemType* to a money category.
var itemTypeToCategory = map[string]string{
	"place":     CategoryTicket, // a paid attraction is an admission ticket
	"food":      CategoryFood,
	"stay":      CategoryStay,
	"transport": CategoryTransport,
	"flight":    CategoryTransport,
	"free":      CategoryOther,
	"note":      CategoryOther,
}

// CategoryForItemType is total: an unrecognised type falls into "other" rather
// than silently dropping the cost out of the rollup.
func CategoryForItemType(itemType string) string {
	if c, ok := itemTypeToCategory[itemType]; ok {
		return c
	}
	return CategoryOther
}

// Categories is the display order used by the Budget and Expense tabs.
var Categories = []string{
	CategoryStay, CategoryTransport, CategoryTicket,
	CategoryFood, CategoryShopping, CategoryOther,
}
