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

	// MockMode keeps the API fully functional without any third party: the
	// database is still real and every write still lands in MySQL, but the
	// providers that need a key or a bill (Anthropic, Google, FX, weather,
	// storage, e-mail) are replaced by deterministic stand-ins. It is what UAT
	// runs on, and it is never on in production.
	MockMode bool

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

	OpenMeteoBase string

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
	Endpoint     string
	Region       string
	AccessKey    string
	SecretKey    string
	ExportBucket string
	ImageBucket  string
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
}

func (c Config) IsProduction() bool { return c.Environment == "production" }

// UseMock reports whether a provider should be stubbed. Production always
// wins: MOCK_MODE=true in a production environment is a misconfiguration, not
// an instruction.
func (c Config) UseMock() bool { return c.MockMode && !c.IsProduction() }
func (c Config) IsDevelopment() bool {
	return c.Environment == "" || c.Environment == "development" || c.Environment == "local"
}
