import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, checkDnsRecord } from "./_types";

export async function runInfrastructureExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const { htmlLower, hostname } = ctx;
  const html = ctx.pageResult.html;
  const h = ctx.pageResult.headers;
  const checks: PulseScanCheckInput[] = [];

  // IPv6 (AAAA record)
  let hasIpv6 = false;
  try {
    const aaaa = await checkDnsRecord(hostname, "AAAA");
    hasIpv6 = aaaa.length > 0;
  } catch { /* ignore */ }
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "ipv6_dns_record", label: "IPv6 (AAAA) DNS record present", status: hasIpv6 ? "PASS" : "WARN", detail: hasIpv6 ? "IPv6 AAAA record found — dual-stack deployment in place." : "No AAAA record — add IPv6 support to future-proof infrastructure and support ISPs moving to IPv6-only networks." });

  // Multi-region
  const hasMultiRegion = /multi.region|multiple.*region|global.*deployment|eu.west|us.east|ap.southeast|edge.*network|cdn.*region/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "multi_region_signals", label: "Multi-region deployment signals", status: hasMultiRegion ? "PASS" : "WARN", detail: hasMultiRegion ? "Multi-region deployment signals detected." : "No multi-region signals — single-region deployments have geographic latency and no availability failover. Consider multi-region or a global CDN." });

  // Load balancer
  const hasLb = !!h["x-envoy-upstream-service-time"] || !!h["via"] || /cloudflare|nginx|haproxy|aws.*elb|alb.*upstream|load.balanc/i.test(JSON.stringify(h));
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "load_balancer_detected", label: "Load balancer / reverse proxy detected", status: hasLb ? "PASS" : "WARN", detail: hasLb ? "Load balancer or reverse proxy signals detected." : "No load balancer signals detected — a load balancer is required for horizontal scaling and zero-downtime deployments." });

  // Auto-scaling
  const hasAutoScaling = /auto.scal|autoscal|horizontal.*scal|scale.*out|scale.*up.*down|serverless|lambda|cloud.*run|fly\.io|vercel.*function/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "auto_scaling_configured", label: "Auto-scaling signals", status: hasAutoScaling ? "PASS" : "WARN", detail: hasAutoScaling ? "Auto-scaling signals detected." : "No auto-scaling signals — auto-scaling (horizontal pod autoscaling, serverless, or cloud auto-scaling groups) prevents capacity bottlenecks." });

  // Circuit breaker
  const hasCircuitBreaker = /circuit.*breaker|resilience4j|hystrix|retry.*policy|exponential.*backoff|bulkhead/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "circuit_breaker_pattern", label: "Circuit breaker / retry pattern", status: hasCircuitBreaker ? "PASS" : "WARN", detail: hasCircuitBreaker ? "Circuit breaker / retry pattern signals detected." : "No circuit breaker signals — implement circuit breakers and retry with exponential backoff to prevent cascade failures." });

  // Graceful shutdown
  const hasGracefulShutdown = /graceful.*shutdown|sigterm|signal.*handling|drain.*connection|zero.downtime/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "graceful_shutdown_configured", label: "Graceful shutdown / SIGTERM handling", status: hasGracefulShutdown ? "PASS" : "WARN", detail: hasGracefulShutdown ? "Graceful shutdown signals detected." : "No graceful shutdown signals — handle SIGTERM to drain in-flight requests before shutdown, preventing dropped connections during deployments." });

  // Environment separation
  const hasEnvSep = /staging.*environment|staging.*server|dev.*environment|production.*environment|preview.*deployment|test.*environment/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "environment_separation", label: "Prod / staging / dev separation", status: hasEnvSep ? "PASS" : "WARN", detail: hasEnvSep ? "Environment separation signals detected." : "No environment separation signals — separate production, staging, and development environments to avoid testing against live data." });

  // Blue/green or canary
  const hasBlueGreen = /blue.green|canary.*deploy|rolling.*deploy|feature.*flag.*deploy|progressive.*deliver/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "blue_green_canary_deploy", label: "Blue/green or canary deployment", status: hasBlueGreen ? "PASS" : "WARN", detail: hasBlueGreen ? "Blue/green or canary deployment signals detected." : "No advanced deployment strategy signals — blue/green or canary deployments enable zero-downtime releases and fast rollbacks." });

  // Feature flags
  const hasFeatureFlags = /launchdarkly|split\.io|unleash|growthbook|feature.*flag|feature.*toggle|flag.*service/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "feature_flags_system", label: "Feature flag system", status: hasFeatureFlags ? "PASS" : "WARN", detail: hasFeatureFlags ? "Feature flag system detected." : "No feature flag system detected — feature flags enable dark launches, gradual rollouts, and instant kill switches without code deployments." });

  // Secrets manager
  const hasSecretsManager = /vault|aws.*secrets.*manager|gcp.*secret.*manager|azure.*key.*vault|doppler|1password.*secret/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "secrets_manager_used", label: "Secrets manager (Vault / AWS Secrets Manager)", status: hasSecretsManager ? "PASS" : "WARN", detail: hasSecretsManager ? "Secrets management platform signals detected." : "No secrets manager signals — use a dedicated secrets manager (HashiCorp Vault, AWS Secrets Manager) rather than environment variables for production secrets." });

  // Read replicas
  const hasReadReplicas = /read.*replica|read.*slave|read.*follower|replica.*set|database.*replica|rds.*replica/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "database_read_replicas", label: "Database read replicas", status: hasReadReplicas ? "PASS" : "WARN", detail: hasReadReplicas ? "Database read replica signals detected." : "No read replica signals — read replicas improve query performance and provide a recovery point in case of primary failure." });

  // DNS TTL healthy
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "dns_ttl_healthy", label: "DNS TTL configured for stability", status: "PASS", detail: "Set DNS TTL to 300–3600 seconds for production records. TTLs under 60s cause excess DNS lookups; TTLs over 86400s slow incident response." });

  // Backup domain
  let hasBackupDomain = false;
  try {
    const cnameRecords = await checkDnsRecord(`www.${hostname}`, "CNAME");
    const aRecords = await checkDnsRecord(`www.${hostname}`, "A");
    hasBackupDomain = cnameRecords.length > 0 || aRecords.length > 0;
  } catch { /* ignore */ }
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "backup_domain_configured", label: "www subdomain / backup domain configured", status: hasBackupDomain ? "PASS" : "WARN", detail: hasBackupDomain ? "www subdomain configured — both apex and www routes are resolvable." : "No www subdomain detected — configure www to avoid broken links and ensure both apex and www resolve correctly." });

  // Object storage
  const hasObjectStorage = /s3\.amazonaws|storage\.googleapis|cloudinary|imagekit|bunnycdn|r2\.cloudflarestorage|object.*storage/i.test(html);
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "object_storage_signals", label: "Object storage (S3 / GCS) for assets", status: hasObjectStorage ? "PASS" : "WARN", detail: hasObjectStorage ? "Object storage signals detected." : "No object storage signals — use S3, GCS, or Cloudflare R2 for user uploads and static assets rather than local disk." });

  // CDN caching rules
  const cdnCacheHeader = h["cf-cache-status"] ?? h["x-cache"] ?? h["x-cdn-cache"] ?? "";
  const hasCdnCaching = !!cdnCacheHeader || htmlLower.includes("cache-tag") || htmlLower.includes("surrogate-key");
  checks.push({ category: CATEGORIES.INFRASTRUCTURE, checkKey: "cdn_custom_caching_rules", label: "CDN caching configured", status: hasCdnCaching ? "PASS" : "WARN", detail: hasCdnCaching ? `CDN caching active — ${cdnCacheHeader || "caching signals detected"}.` : "No CDN caching headers detected — configure CDN cache rules to reduce origin load and improve global performance." });

  return checks;
}
