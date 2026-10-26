import { describe, expect, it } from "vitest";
import { OPERATIONAL_DEPTH_RULES, evaluateOperationalRuleText } from "../operational-depth";

const evalKey = (key: string, text: string) => {
  const rule = OPERATIONAL_DEPTH_RULES.find((candidate) => candidate.key === key);
  if (!rule) throw new Error(`missing rule ${key}`);
  return evaluateOperationalRuleText(rule, text).status;
};

describe("audit repo-operational-depth-1", () => {
  it("api_depth_contract_validation_ci: identifiers are not a contract; rswag counts; un-linted spec still warns", () => {
    expect(
      evalKey(
        "api_depth_contract_validation_ci",
        "agentcore/.llm-context/agentcore.ts\nexport type TargetType =\n  | 'lambda'\n  | 'openApiSchema'\n  | 'smithyModel';\n  schemaSource?: SchemaSource;",
      ),
    ).toBe("SKIPPED");
    expect(
      evalKey(
        "api_depth_contract_validation_ci",
        'spec/swagger_helper.rb\nrequire "rswag/specs"\nRSpec.configure do |config|\n  config.openapi_root = Rails.root.join("openapi").to_s\n  config.openapi_specs = {\n    "openapi.yaml" => {',
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "api_depth_contract_validation_ci",
        'docs/api-reference/v2/openapi.json\n{\n  "openapi": "3.0.0",\n  "paths": {}\n}\n.github/workflows/pr.yml\nrun: yarn test',
      ),
    ).toBe("WARN");
  });

  it("api_depth_cursor_validation: CSS and DB cursors are not pagination; raw client cursor still warns", () => {
    expect(
      evalKey(
        "api_depth_cursor_validation",
        'components/ui/menubar.tsx\nclassName={cn("flex cursor-default select-none items-center rounded-sm px-3 py-1.5", className)}',
      ),
    ).toBe("SKIPPED");
    expect(
      evalKey(
        "api_depth_cursor_validation",
        'docs/tests/test_models.py\n        with connection.cursor() as cursor:\n            cursor.execute("SET default_text_search_config = \'simple\'")',
      ),
    ).toBe("SKIPPED");
    expect(
      evalKey(
        "api_depth_cursor_validation",
        "get.handler.ts\nconst offset = Number(req.query.cursor ?? 0);\nreturn { bookings, nextCursor: offset + take };",
      ),
    ).toBe("WARN");
  });

  it("api_depth_page_size_cap: prose 'limits' is not pagination; uncapped query.limit still warns", () => {
    expect(
      evalKey(
        "api_depth_page_size_cap",
        "agentcore/cdk/lib/cdk-stack.ts\n    // separate ManagementRole and limits the agent's role to ProcessPayload",
      ),
    ).toBe("SKIPPED");
    expect(
      evalKey(
        "api_depth_page_size_cap",
        "src/app/routes/article/article.service.ts\n    skip: Number(query.offset) || 0,\n    take: Number(query.limit) || 10,",
      ),
    ).toBe("WARN");
  });

  it("api_depth_request_deadline: app-server worker timeout counts; healthcheck timeout does not", () => {
    expect(
      evalKey(
        "api_depth_request_deadline",
        "config/pitchfork.conf.rb\nif ENV[\"RAILS_ENV\"] == \"production\"\n  # nuke workers after 30 seconds instead of 60 seconds (the default)\n  timeout 30\nelse\n  timeout(60)\nend\nlib/middleware/request_tracker.rb\nclass Middleware::RequestTracker",
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "api_depth_request_deadline",
        "docker-compose.yml\n    healthcheck:\n      test: [\"CMD\", \"pg_isready\"]\n      timeout: 10s\nviews.py\ndef index(request):\n    return render(request, \"index.html\")",
      ),
    ).toBe("WARN");
  });

  it("api_depth_response_schema: whitelist mappers count as boundary serialisation; raw ORM row still warns", () => {
    expect(
      evalKey(
        "api_depth_response_schema",
        "src/app/routes/article/article.controller.ts\nrouter.get('/articles', auth.optional, async (req, res) => {\n  const result = await getArticles(req.query, req.auth?.user?.id);\n  res.json(result);\n});\nsrc/app/routes/article/article.service.ts\n  return { articles: articles.map((article: any) => articleMapper(article, id)) };",
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "api_depth_response_schema",
        "src/routes/users.ts\nrouter.get('/users', async (req, res) => { res.json(await prisma.user.findMany()); });",
      ),
    ).toBe("WARN");
  });

  it("api_depth_webhook_replay_window: Stripe construct_event enforces tolerance; bare shared secret still fails", () => {
    expect(
      evalKey(
        "api_depth_webhook_replay_window",
        'fundraising/views.py\n@require_POST\n@csrf_exempt\ndef receive_webhook(request):\n    try:\n        event = stripe.Webhook.construct_event(\n            request.body,\n            request.headers["stripe-signature"],\n            settings.STRIPE_ENDPOINT_SECRET,\n        )\n    except (KeyError, ValueError, stripe.SignatureVerificationError):\n        return HttpResponse(status=422)',
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "api_depth_webhook_replay_window",
        'lib/shopify/index.ts\nexport async function revalidate(req: NextRequest) {\n  // shopify webhook topic\n  const secret = req.nextUrl.searchParams.get("secret");\n  if (!secret || secret !== process.env.SHOPIFY_REVALIDATION_SECRET) {\n    return NextResponse.json({ status: 401 });\n  }',
      ),
    ).toBe("WARN");
  });

  it("auth_depth_csrf_state_change: header-token APIs skip; cookie-session mutation still warns", () => {
    expect(
      evalKey(
        "auth_depth_csrf_state_change",
        "src/app/routes/auth/auth.ts\nconst getTokenFromHeaders = (req: express.Request): string | null => {\n  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Token') {\n    return req.headers.authorization.split(' ')[1];\n  }\n  return null;\n};\nsrc/app/routes/auth/auth.controller.ts\nrouter.post('/users/login', async (req, res, next) => { res.json({ user: await login(req.body.user) }); });",
      ),
    ).toBe("SKIPPED");
    expect(
      evalKey(
        "auth_depth_csrf_state_change",
        'server.js\nconst session = require("express-session");\napp.use(session({ secret: process.env.SECRET }));\napp.post("/profile", updateProfile);',
      ),
    ).toBe("WARN");
  });

  it("auth_depth_generic_login_errors: realworld/cal.com generic errors pass; user-not-found still warns", () => {
    expect(
      evalKey(
        "auth_depth_generic_login_errors",
        "src/app/routes/auth/auth.service.ts\nexport const login = async (userPayload: any) => {\n  const match = await bcrypt.compare(password, user.password);\n  throw new HttpException(403, {\n    errors: {\n      'email or password': ['is invalid'],\n    },\n  });\n};",
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "auth_depth_generic_login_errors",
        "packages/features/auth/lib/next-auth-options.ts\npages: { signIn: \"/auth/login\" },\nconst authorize = async (credentials) => {\n  // Don't leak information about it being username or password that is invalid\n  if (!user) {\n    throw new Error(ErrorCode.IncorrectEmailPassword);\n  }\n  const isCorrectPassword = await verifyPassword(credentials.password, user.password.hash);\n};",
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "auth_depth_generic_login_errors",
        "src/routes/login.ts\nif (!user) return res.status(404).json({ error: 'User not found' });\nconst match = await bcrypt.compare(password, user.password);\nif (!match) return res.status(401).json({ error: 'Wrong password' });",
      ),
    ).toBe("WARN");
  });

  it("auth_depth_oauth_redirect_allowlist: exact registered redirect_uri match passes; open redirect still fails", () => {
    expect(
      evalKey(
        "auth_depth_oauth_redirect_allowlist",
        'packages/features/oauth/services/OAuthService.ts\n    if (redirectUri && client.redirectUri !== redirectUri) {\n      throw new ErrorWithCode(ErrorCode.BadRequest, "invalid_request", { reason: "redirect_uri_mismatch" });\n    }',
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "auth_depth_oauth_redirect_allowlist",
        "routes/oauth.ts\napp.get('/oauth/callback', (req, res) => {\n  const returnTo = req.query.returnTo;\n  res.redirect(req.query.returnTo);\n});",
      ),
    ).toBe("FAIL");
  });

  it("auth_depth_sensitive_reauthentication: oldPassword verification passes; bare change still warns", () => {
    expect(
      evalKey(
        "auth_depth_sensitive_reauthentication",
        'changePassword.handler.ts\nexport const changePasswordHandler = async ({ input, ctx }) => {\n  const { oldPassword, newPassword } = input;\n  const passwordsMatch = await verifyPassword(oldPassword, hash);\n  if (!passwordsMatch) throw new TRPCError({ code: "BAD_REQUEST" });\n};',
      ),
    ).toBe("PASS");
    expect(
      evalKey(
        "auth_depth_sensitive_reauthentication",
        'routes/account.ts\nrouter.post("/change-email", async (req, res) => { await db.user.update({ data: { email: req.body.email } }); });',
      ),
    ).toBe("WARN");
  });

  it("auth_depth_session_cookie_flags: NextAuth getServerSession/session callback skip; insecure express-session still fails", () => {
    expect(
      evalKey(
        "auth_depth_session_cookie_flags",
        'lib/session.ts\nimport { getServerSession } from "next-auth/next"\nexport async function getCurrentUser() {\n  const session = await getServerSession(authOptions)\n  return session?.user\n}\nlib/auth.ts\n  callbacks: {\n    async session({ token, session }) {\n      return session\n    },\n  },',
      ),
    ).toBe("SKIPPED");
    expect(
      evalKey(
        "auth_depth_session_cookie_flags",
        'server.js\nconst session = require("express-session");\napp.use(session({ secret: "keyboard cat", cookie: { secure: false, httpOnly: true, sameSite: "lax" } }));',
      ),
    ).toBe("FAIL");
  });
});
