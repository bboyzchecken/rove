package core

// Config is the single typed view of every environment variable the API reads.
// Values are loaded from the ROOT .env of the monorepo (docker compose injects
// them as real env vars) — see DEV_SPEC §6.1 / §14.
type Config struct {
	Environment string
	Commit      string
	Port        string

	JwtSecret   string
	AdminEmails []string
	// WebhookSecret guards /webhooks/affiliate/:partner until each partner's
	// own signature scheme is wired in.
	WebhookSecret string

	// Name of the httpOnly cookie the Next.js BFF sets; the API accepts it as
	// an alternative to the Authorization header.
	AuthCookieName string

	AppBaseURL string // public URL of this API (oauth callback, /go/:id deeplink)
	WebBaseURL string // public URL of the web app (CORS allowlist, invite links)

	MySQL     MySQLConfig
	Redis     RedisConfig
	R2        R2Config
	Anthropic AnthropicConfig
	Google    GoogleConfig
	Line      LineConfig
	FX        FXConfig
	Email     EmailConfig
	Points    PointsConfig

	OpenMeteoBase string
	// GotenbergURL points at the PDF renderer container; empty disables PDF
	// export and the API offers HTML instead (DEV_SPEC §16).
	GotenbergURL string

	// partner key ("agoda", "booking", ...) -> affiliate id
	Affiliate map[string]string
}

type MySQLConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	Database string
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
}

type R2Config struct {
	Endpoint       string
	Region         string
	AccessKey      string
	SecretKey      string
	ExportBucket   string
	ImageBucket    string
	DocumentBucket string
	PhotoBucket    string
}

type AnthropicConfig struct {
	ApiKey          string
	ModelPlanner    string
	ModelFast       string
	MaxTokens       int
	DailyCostCapUSD float64
}

type GoogleConfig struct {
	MapsServerKey     string
	OAuthClientID     string
	OAuthClientSecret string
}

type LineConfig struct {
	LoginChannelID     string
	LoginChannelSecret string
	MessagingToken     string
}

type FXConfig struct {
	ApiURL string
	ApiKey string
	// CacheTTLHours defaults to 24 (DEV_SPEC §6.1).
	CacheTTLHours int
}

type EmailConfig struct {
	ResendAPIKey string
	From         string
}

// PointsConfig mirrors domain.PointsConfig; kept here so the values arrive
// through the same env path as everything else (DEV_SPEC §6.1).
type PointsConfig struct {
	EarnRatePct      float64
	MinRedeemBalance float64
}

func (c Config) IsProduction() bool { return c.Environment == "production" }
func (c Config) IsDevelopment() bool {
	return c.Environment == "" || c.Environment == "development" || c.Environment == "local"
}
