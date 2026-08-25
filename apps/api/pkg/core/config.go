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

	// StubProviders replaces the third parties that need a key or a bill
	// (Anthropic, Google, FX, weather, storage, e-mail) with deterministic
	// stand-ins. It is never on in production.
	//
	// It is NOT a mock database. Every write still lands in MySQL exactly as it
	// would otherwise — which is the whole reason this field is no longer
	// called MockMode. "Mock mode" is the web app's own thing
	// (NEXT_PUBLIC_DATA_MODE=mock: browser-only, nothing is saved anywhere),
	// and one name covering both made "is any of this real?" a question with no
	// answer. Two axes, two names:
	//
	//   NEXT_PUBLIC_DATA_MODE=mock  → nothing is real, nothing is stored
	//   STUB_PROVIDERS=true         → the data is real, the providers are not
	//
	// Reads STUB_PROVIDERS, falling back to the old MOCK_MODE.
	StubProviders bool

	// DevLogin registers POST /auth/demo: a sign-in with no provider behind it,
	// for a machine that has no OAuth credentials yet. It used to ride along
	// with MOCK_MODE, which meant turning off the provider stubs also took away
	// the only way to sign in. Its own switch, so each can be answered on its
	// own. Never on in production.
	DevLogin bool

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

	// Shared secret partner postbacks must present (A12.6). Empty = the
	// webhook is not enabled and answers 404.
	AffiliateWebhookSecret string

	// Where an agent handoff goes (A12.12). Both empty means the lead is still
	// stored and the screen says nobody was messaged — a saved request with an
	// honest label beats a form that pretends.
	AgentEmail      string
	AgentLineUserID string
	AgentPartner    string

	// Which half of the product this process is (Phase 3 — INFRA):
	// "all" (default) serves HTTP and runs AI drafts in the same binary,
	// "api" serves HTTP and hands drafts to a queue, "worker" only drains it.
	Role string
}

// IsWorker reports whether this process exists to drain the AI queue rather
// than to answer requests.
func (c Config) IsWorker() bool { return c.Role == "worker" }

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
}

func (c Config) IsProduction() bool { return c.Environment == "production" }

// UseStubs reports whether a provider should be stubbed. Production always
// wins: STUB_PROVIDERS=true in a production environment is a misconfiguration,
// not an instruction.
func (c Config) UseStubs() bool { return c.StubProviders && !c.IsProduction() }

// UseDevLogin reports whether the provider-less sign-in door exists. Same
// production override, for the same reason.
func (c Config) UseDevLogin() bool { return c.DevLogin && !c.IsProduction() }
func (c Config) IsDevelopment() bool {
	return c.Environment == "" || c.Environment == "development" || c.Environment == "local"
}
