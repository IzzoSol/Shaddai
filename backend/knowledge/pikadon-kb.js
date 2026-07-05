// PIKADON Knowledge Base — Security & Compliance (conceptual / evergreen only)
// Local, zero-dependency, no network. Holds definitions, attack classes, defenses,
// auth/crypto fundamentals, secure-coding practices and compliance concepts.
// Does NOT contain live CVE data, exploit payloads, or anything fetched from the network.

const STOP = new Set([
  'the','a','an','of','to','is','in','on','and','or','for','what','whats','how',
  'do','does','are','be','by','with','as','it','this','that','me','my','you','your',
  'i','we','can','tell','about','explain','define','definition','meaning','vs','versus',
  'between','difference','when','why','which','into','from','at','so','if','then',
  'protect','prevent','against','stop','mitigate','attack','attacks','security'
]);

function words(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !STOP.has(w));
}

const entries = [
  // ---- OWASP Top 10 ----
  { keys: ['owasp', 'owasp top 10', 'top ten', 'web risks'], title: 'OWASP Top 10',
    text: 'The OWASP Top 10 is a widely used awareness document listing the most critical web application security risks, updated every few years by the Open Worldwide Application Security Project. Recent editions cover Broken Access Control, Cryptographic Failures, Injection, Insecure Design, Security Misconfiguration, Vulnerable Components, Identification/Authentication Failures, Software & Data Integrity Failures, Security Logging/Monitoring Failures, and SSRF. It is a baseline checklist for secure development, not an exhaustive standard.' },
  { keys: ['broken access control', 'access control', 'authorization failure', 'privilege'], title: 'Broken Access Control (OWASP A01)',
    text: 'Broken Access Control occurs when users can act outside their intended permissions — accessing other users\' data, editing records they should not, or reaching admin functions. It is the #1 OWASP risk. Mitigate by denying access by default, enforcing authorization on the server for every request, using role/attribute-based checks, and never trusting client-supplied identifiers or hidden fields.' },
  { keys: ['cryptographic failures', 'crypto failures', 'sensitive data exposure', 'weak encryption'], title: 'Cryptographic Failures (OWASP A02)',
    text: 'Cryptographic Failures (formerly "Sensitive Data Exposure") happen when data is not properly protected in transit or at rest — no TLS, weak or outdated algorithms (MD5, SHA-1, DES), hardcoded keys, or unsalted password hashes. Mitigate by encrypting sensitive data with strong modern algorithms (AES-256, TLS 1.2+), hashing passwords with bcrypt/argon2, managing keys securely, and never rolling your own crypto.' },
  { keys: ['injection', 'injection attack', 'command injection'], title: 'Injection (OWASP A03)',
    text: 'Injection flaws let attackers send untrusted data that a system interprets as commands or queries — SQL, NoSQL, OS command, LDAP, and cross-site scripting all fall under this class. It remains one of the most damaging risks. Mitigate with parameterized queries/prepared statements, safe APIs, strict input validation and allow-listing, and escaping output for the correct context.' },
  { keys: ['insecure design', 'threat modeling', 'secure by design'], title: 'Insecure Design (OWASP A04)',
    text: 'Insecure Design is a category for flaws rooted in missing or ineffective security controls at the architecture level, which no amount of clean implementation can fix. Examples include lacking rate limits, weak business-logic validation, or missing threat modeling. Mitigate by building security in from the start: threat modeling, secure design patterns, reference architectures, and abuse-case testing.' },
  { keys: ['security misconfiguration', 'misconfiguration', 'default credentials', 'hardening'], title: 'Security Misconfiguration (OWASP A05)',
    text: 'Security Misconfiguration covers insecure default settings, unnecessary open ports/features, verbose error messages, default credentials, and unpatched systems. It is extremely common because systems ship insecure by default. Mitigate with hardened baseline configs, removing unused features, disabling directory listings and stack traces in production, and automated configuration checks.' },
  { keys: ['vulnerable components', 'outdated components', 'dependency', 'supply chain', 'sbom'], title: 'Vulnerable & Outdated Components (OWASP A06)',
    text: 'This risk arises from using libraries, frameworks, or runtimes with known vulnerabilities or that are unsupported and unpatched. A single vulnerable dependency can compromise the whole app. Mitigate by inventorying dependencies (SBOM), continuously scanning with tools like Dependabot/Snyk, patching promptly, and removing unused packages.' },
  { keys: ['authentication failures', 'identification failures', 'broken authentication', 'credential stuffing'], title: 'Identification & Authentication Failures (OWASP A07)',
    text: 'These failures include weak passwords, credential stuffing, missing brute-force protection, exposed session IDs, and broken logout or password-reset flows. Mitigate with multi-factor authentication, strong password policies, rate limiting and account lockout, secure session management, and checking passwords against breached-password lists.' },
  { keys: ['software integrity failures', 'data integrity failures', 'insecure deserialization', 'ci cd security'], title: 'Software & Data Integrity Failures (OWASP A08)',
    text: 'This category covers code and infrastructure that trusts unverified sources — insecure deserialization, unsigned updates, or compromised CI/CD pipelines that let attackers inject malicious code. Mitigate with digital signatures on code and packages, verifying integrity of dependencies and updates, securing the build pipeline, and avoiding deserialization of untrusted data.' },
  { keys: ['logging failures', 'monitoring failures', 'insufficient logging', 'detection'], title: 'Security Logging & Monitoring Failures (OWASP A09)',
    text: 'Without adequate logging and monitoring, breaches go undetected for long periods, delaying response. This risk covers missing audit logs, unmonitored alerts, and logs that lack useful detail. Mitigate by logging security-relevant events (logins, failures, access-control decisions), centralizing and protecting logs, setting alerts, and testing incident-response playbooks.' },
  { keys: ['ssrf', 'server side request forgery'], title: 'Server-Side Request Forgery (OWASP A10 / SSRF)',
    text: 'SSRF occurs when an attacker tricks the server into making requests to unintended destinations — internal services, cloud metadata endpoints (169.254.169.254), or arbitrary URLs. It can expose internal systems and credentials. Mitigate by validating and allow-listing outbound URLs/hosts, blocking internal IP ranges and metadata endpoints, disabling unused URL schemes, and not returning raw responses to the user.' },

  // ---- Vulnerability classes ----
  { keys: ['sqli', 'sql injection', 'sql'], title: 'SQL Injection (SQLi)',
    text: 'SQL Injection lets an attacker insert malicious SQL through unsanitized input, allowing them to read, modify, or delete database data, bypass authentication, or even run commands. It happens when user input is concatenated directly into a query. Prevent it with parameterized queries / prepared statements, ORMs used safely, least-privilege database accounts, and input validation — never build queries by string concatenation.' },
  { keys: ['xss', 'cross site scripting', 'stored xss', 'reflected xss', 'dom xss'], title: 'Cross-Site Scripting (XSS)',
    text: 'XSS injects malicious JavaScript into pages viewed by other users, letting attackers steal sessions/cookies, deface pages, or perform actions as the victim. Types are stored (persisted server-side), reflected (echoed from the request), and DOM-based (client-side). Prevent it by context-aware output encoding/escaping, validating input, using a Content Security Policy, setting HttpOnly cookies, and using frameworks that auto-escape.' },
  { keys: ['csrf', 'cross site request forgery', 'xsrf'], title: 'Cross-Site Request Forgery (CSRF)',
    text: 'CSRF tricks an authenticated user\'s browser into sending an unwanted request (e.g., changing their email or transferring funds) using their existing session cookies. Prevent it with anti-CSRF tokens tied to the session, the SameSite cookie attribute (Lax/Strict), verifying Origin/Referer headers, and requiring re-authentication for sensitive actions.' },
  { keys: ['idor', 'insecure direct object reference', 'object reference'], title: 'IDOR (Insecure Direct Object Reference)',
    text: 'IDOR is an access-control flaw where an app exposes a direct reference to an object (like /account?id=123) and fails to verify the user is authorized for it, so changing the ID reveals someone else\'s data. Prevent it by enforcing server-side authorization checks on every object access, using indirect or unpredictable references, and never relying on obscurity of IDs alone.' },
  { keys: ['path traversal', 'directory traversal', 'lfi', 'file inclusion', 'dot dot slash'], title: 'Path Traversal',
    text: 'Path Traversal (directory traversal) uses sequences like "../" in file paths to escape the intended directory and read or write arbitrary files such as /etc/passwd or config secrets. Prevent it by validating and canonicalizing paths, allow-listing filenames, rejecting traversal sequences, serving files through safe APIs, and running with least-privilege file permissions.' },
  { keys: ['ssti', 'template injection', 'server side template injection'], title: 'Server-Side Template Injection (SSTI)',
    text: 'SSTI happens when user input is embedded directly into a server-side template that is then evaluated, letting attackers execute template expressions and often achieve remote code execution. Prevent it by never passing user input into template code, using logic-less templates, sandboxing the template engine, and treating user data strictly as values, not template source.' },
  { keys: ['rce', 'remote code execution', 'arbitrary code execution'], title: 'Remote Code Execution (RCE)',
    text: 'Remote Code Execution is among the most severe vulnerabilities, letting an attacker run arbitrary code on a target system — often leading to full compromise. It commonly stems from injection, insecure deserialization, or vulnerable components. Prevent it by eliminating injection sinks, avoiding dangerous functions (eval, system), validating input, patching components, and running services with least privilege and sandboxing.' },
  { keys: ['xxe', 'xml external entity', 'xml injection'], title: 'XML External Entity (XXE)',
    text: 'XXE abuses XML parsers that process external entity references, allowing attackers to read local files, perform SSRF, or cause denial of service. It stems from insecurely configured XML parsers. Prevent it by disabling DTDs and external entity resolution in the parser, using less complex data formats like JSON where possible, and patching XML libraries.' },
  { keys: ['open redirect', 'unvalidated redirect', 'redirect'], title: 'Open Redirect',
    text: 'An open redirect lets an attacker craft a link on a trusted domain that forwards the victim to a malicious site, aiding phishing and OAuth token theft. It happens when a redirect target comes from unvalidated user input. Prevent it by allow-listing permitted redirect destinations, using relative paths or mapped keys instead of raw URLs, and showing an interstitial for external links.' },
  { keys: ['clickjacking', 'ui redress', 'iframe attack'], title: 'Clickjacking',
    text: 'Clickjacking overlays or frames a target site invisibly so victims click hidden buttons (e.g., approving a transfer) while thinking they interact with something else. Prevent it with the X-Frame-Options header (DENY/SAMEORIGIN) or the Content-Security-Policy frame-ancestors directive to control who may embed your pages in a frame.' },
  { keys: ['dos', 'ddos', 'denial of service', 'rate limiting', 'resource exhaustion'], title: 'Denial of Service (DoS/DDoS)',
    text: 'A Denial-of-Service attack overwhelms a system\'s resources (bandwidth, CPU, memory, connections) to make it unavailable; DDoS uses many distributed sources. Application-layer DoS can exploit expensive operations or unbounded input. Mitigate with rate limiting, input size caps, timeouts, autoscaling, CDNs/WAFs, and upstream DDoS protection services.' },
  { keys: ['insecure deserialization', 'deserialization', 'object injection'], title: 'Insecure Deserialization',
    text: 'Insecure deserialization occurs when untrusted serialized data is reconstructed into objects without validation, enabling tampering, privilege escalation, or remote code execution. Prevent it by never deserializing untrusted data, using data-only formats (JSON) with strict schemas, applying integrity checks/signatures, and isolating deserialization in low-privilege contexts.' },
  { keys: ['prototype pollution', 'javascript prototype'], title: 'Prototype Pollution',
    text: 'Prototype pollution is a JavaScript-specific flaw where attacker-controlled keys like "__proto__" modify the base Object prototype, affecting all objects and leading to property injection, denial of service, or RCE. Prevent it by validating/sanitizing keys, using Map instead of plain objects for user data, freezing prototypes, and using libraries hardened against it.' },

  // ---- Authentication & sessions ----
  { keys: ['bcrypt', 'argon2', 'scrypt', 'pbkdf2', 'password hashing'], title: 'Password Hashing (bcrypt / argon2)',
    text: 'Passwords must be stored as slow, salted hashes — never plaintext or fast hashes like MD5/SHA-256. Adaptive algorithms such as bcrypt, scrypt, argon2, and PBKDF2 are deliberately expensive to compute, resisting brute-force and GPU cracking. Argon2id is the current recommended choice; configure an appropriate work factor and increase it as hardware improves.' },
  { keys: ['salt', 'salting', 'pepper', 'rainbow table'], title: 'Salting & Peppering',
    text: 'A salt is a unique random value added to each password before hashing so identical passwords produce different hashes, defeating precomputed "rainbow table" attacks. Salts are stored alongside the hash and need not be secret. A pepper is an additional secret value (kept separate, e.g., in an HSM/env) added to all hashes for defense in depth.' },
  { keys: ['jwt', 'json web token', 'bearer token', 'token claims'], title: 'JWT (JSON Web Tokens)',
    text: 'A JWT is a signed, self-contained token carrying claims (like user ID and roles) used for stateless authentication, with a header, payload, and signature. Because the payload is only base64-encoded (not encrypted), never store secrets in it. Secure JWTs by verifying the signature with a strong algorithm, rejecting "alg:none", using short expirations, validating issuer/audience, and having a revocation strategy.' },
  { keys: ['oauth', 'oauth2', 'openid connect', 'oidc', 'authorization code'], title: 'OAuth 2.0 & OpenID Connect',
    text: 'OAuth 2.0 is a delegated authorization framework that lets an app access resources on a user\'s behalf without handling their password, via access tokens. OpenID Connect adds an identity layer (ID tokens) on top for authentication/login. Use the Authorization Code flow with PKCE for web/mobile apps, validate redirect URIs strictly, use short-lived tokens, and never expose client secrets in browsers.' },
  { keys: ['mfa', '2fa', 'multi factor', 'two factor', 'totp', 'authenticator'], title: 'Multi-Factor Authentication (MFA)',
    text: 'MFA requires two or more independent factors — something you know (password), have (phone/security key), or are (biometric) — so a stolen password alone is not enough. TOTP authenticator apps and FIDO2/WebAuthn hardware keys are far stronger than SMS, which is vulnerable to SIM swapping. MFA is one of the most effective defenses against account takeover.' },
  { keys: ['session', 'session management', 'session hijacking', 'session fixation', 'cookie'], title: 'Session Management',
    text: 'Sessions track a logged-in user across requests, usually via a session ID stored in a cookie. Attacks include session hijacking (stealing the ID) and session fixation (forcing a known ID). Secure sessions by generating strong random IDs, regenerating the ID on login/privilege change, setting HttpOnly/Secure/SameSite cookie flags, enforcing idle and absolute timeouts, and invalidating sessions on logout.' },
  { keys: ['authentication vs authorization', 'authn', 'authz', 'authorization'], title: 'Authentication vs Authorization',
    text: 'Authentication (AuthN) verifies who you are — proving identity via passwords, tokens, or biometrics. Authorization (AuthZ) determines what you are allowed to do once authenticated — which resources and actions your role permits. They are distinct: strong authentication without proper authorization still leads to broken access control. Both must be enforced server-side on every request.' },
  { keys: ['sso', 'single sign on', 'saml', 'federated identity'], title: 'Single Sign-On (SSO)',
    text: 'Single Sign-On lets users authenticate once with an identity provider and access multiple applications without logging in again, using protocols like SAML or OpenID Connect. It improves user experience and centralizes access control, offboarding, and MFA enforcement. The trade-off is that the identity provider becomes a high-value single point of failure and must be strongly protected.' },
  { keys: ['brute force', 'credential stuffing', 'password spraying', 'account lockout'], title: 'Brute Force & Credential Stuffing',
    text: 'Brute-force attacks guess credentials by trying many combinations; credential stuffing reuses username/password pairs leaked from other breaches; password spraying tries a few common passwords across many accounts to avoid lockout. Defend with rate limiting, account lockout/backoff, CAPTCHA, MFA, breached-password checks, and monitoring for anomalous login patterns.' },
  { keys: ['api key', 'api keys', 'api authentication', 'token authentication'], title: 'API Keys & Authentication',
    text: 'API keys identify and authorize calling applications but are often long-lived and easily leaked, so they are weaker than short-lived tokens. Protect them by transmitting only over TLS, scoping them to minimal permissions, rotating regularly, rate-limiting per key, and never embedding them in client-side code or committing them to source control. Prefer OAuth tokens or signed requests for user-level access.' },

  // ---- Cryptography basics ----
  { keys: ['symmetric encryption', 'aes', 'symmetric key', 'block cipher'], title: 'Symmetric Encryption',
    text: 'Symmetric encryption uses a single shared secret key to both encrypt and decrypt data, making it fast and ideal for bulk data (e.g., AES-256). Its challenge is securely distributing and storing the shared key, since anyone with it can decrypt. Use authenticated modes like AES-GCM to provide both confidentiality and integrity, and never reuse a nonce with the same key.' },
  { keys: ['asymmetric encryption', 'public key cryptography', 'rsa', 'ecc', 'key pair'], title: 'Asymmetric Encryption',
    text: 'Asymmetric (public-key) cryptography uses a mathematically linked key pair: a public key encrypts (or verifies) and a private key decrypts (or signs). It solves key distribution — you can share the public key openly — and enables digital signatures, but is slower than symmetric crypto. Common algorithms are RSA and elliptic-curve (ECC). In practice, systems combine both: asymmetric to exchange a symmetric session key.' },
  { keys: ['hashing', 'hash function', 'sha256', 'checksum', 'one way'], title: 'Hashing',
    text: 'A cryptographic hash function maps data of any size to a fixed-length digest that is one-way (irreversible) and collision-resistant, so the same input always yields the same output but the output cannot be reversed. Uses include integrity checks, digital signatures, and password storage. Use strong algorithms like SHA-256/SHA-3; avoid broken ones like MD5 and SHA-1.' },
  { keys: ['hashing vs encryption', 'encryption vs hashing', 'reversible'], title: 'Hashing vs Encryption',
    text: 'Encryption is reversible: data is scrambled with a key and can be decrypted back to the original — used for confidentiality. Hashing is one-way: it produces a fixed digest that cannot be reversed — used for integrity verification and password storage. A common mistake is "encrypting" passwords (reversible) instead of hashing them; passwords should always be salted and hashed, never encrypted.' },
  { keys: ['tls', 'ssl', 'https', 'certificate', 'handshake'], title: 'TLS / HTTPS',
    text: 'TLS (Transport Layer Security, the successor to SSL) encrypts data in transit between client and server, providing confidentiality, integrity, and server authentication via certificates. The handshake uses asymmetric crypto to agree on a symmetric session key, then encrypts traffic with it. Use TLS 1.2+ (prefer 1.3), valid CA-issued certificates, HSTS, and disable weak ciphers and old protocol versions.' },
  { keys: ['digital signature', 'signing', 'signature verification', 'non repudiation'], title: 'Digital Signatures',
    text: 'A digital signature proves a message\'s authenticity and integrity: the sender signs a hash of the data with their private key, and anyone can verify it with the corresponding public key. It provides non-repudiation — the signer cannot deny signing. Signatures underpin TLS certificates, code signing, and blockchain transactions.' },
  { keys: ['key management', 'key rotation', 'kms', 'hsm', 'key storage'], title: 'Key Management',
    text: 'Key management is the secure generation, storage, distribution, rotation, and destruction of cryptographic keys — often the weakest link in a crypto system. Best practices include storing keys in a dedicated Key Management Service (KMS) or Hardware Security Module (HSM), separating keys from the data they protect, rotating them periodically, and enforcing least-privilege access with audit logging.' },
  { keys: ['entropy', 'randomness', 'csprng', 'secure random', 'nonce'], title: 'Randomness & Entropy',
    text: 'Strong cryptography depends on unpredictable randomness for keys, tokens, salts, and nonces. Use a cryptographically secure pseudo-random number generator (CSPRNG) such as the OS-provided secure random, never a standard Math.random() or predictable seed. Weak randomness has broken real systems by making session tokens or keys guessable.' },
  { keys: ['encryption at rest', 'encryption in transit', 'data protection'], title: 'Encryption at Rest vs in Transit',
    text: 'Encryption in transit (TLS) protects data moving over networks from eavesdropping and tampering; encryption at rest protects stored data (databases, disks, backups) if the storage is stolen or accessed. Both are needed for defense in depth. Manage keys separately from encrypted data, and consider field-level encryption for the most sensitive records.' },
  { keys: ['e2ee', 'end to end encryption'], title: 'End-to-End Encryption (E2EE)',
    text: 'End-to-end encryption ensures only the communicating endpoints can read messages — data is encrypted on the sender\'s device and decrypted only on the recipient\'s, so not even the service provider can access the plaintext. It offers the strongest confidentiality (used by Signal, WhatsApp) but complicates features like server-side search and content moderation, and depends on secure key exchange.' },

  // ---- Secure coding & operations ----
  { keys: ['input validation', 'sanitization', 'allow list', 'whitelist', 'output encoding'], title: 'Input Validation & Output Encoding',
    text: 'Never trust input from users, APIs, or files. Validate input against strict expectations (type, length, format, range) using allow-lists rather than trying to block known-bad ("deny-lists"). Separately, encode/escape data on output for its destination context (HTML, SQL, shell, URL) to neutralize injection. Validation and encoding are complementary, not interchangeable.' },
  { keys: ['least privilege', 'principle of least privilege', 'polp', 'privilege escalation'], title: 'Principle of Least Privilege',
    text: 'The Principle of Least Privilege means every user, process, and service should have only the minimum permissions needed to do its job, and no more. It limits the blast radius of a compromise — a breached low-privilege account cannot reach critical systems. Apply it to database accounts, API scopes, cloud IAM roles, and file permissions, and review/revoke access regularly.' },
  { keys: ['defense in depth', 'layered security', 'security layers'], title: 'Defense in Depth',
    text: 'Defense in depth layers multiple independent security controls so that if one fails, others still protect the system — no single point of failure. Layers span network (firewalls, segmentation), host (hardening, patching), application (validation, authz), and data (encryption). The assumption is that any single control can be bypassed, so redundancy is essential.' },
  { keys: ['secret management', 'secrets', 'hardcoded secrets', 'vault', 'env variables'], title: 'Secret Management',
    text: 'Secrets — API keys, passwords, tokens, private keys — must never be hardcoded in source, committed to version control, or logged. Store them in a dedicated secrets manager (HashiCorp Vault, AWS Secrets Manager) or environment variables injected at runtime, with encryption, access control, rotation, and audit logging. Rotate immediately if a secret is exposed, and scan repos for leaked secrets.' },
  { keys: ['secure defaults', 'fail secure', 'fail closed', 'deny by default'], title: 'Secure Defaults & Fail-Safe',
    text: 'Systems should be secure out of the box: deny by default, disable unnecessary features, and require explicit opt-in for risky capabilities. "Fail secure" (fail closed) means that when something errors, access is denied rather than granted. Verbose errors, default passwords, and open permissions are common insecure defaults that attackers exploit.' },
  { keys: ['csp', 'content security policy', 'security headers', 'hsts'], title: 'Security Headers & CSP',
    text: 'HTTP security headers instruct browsers to enforce protections: Content-Security-Policy restricts allowed script/resource sources to mitigate XSS; Strict-Transport-Security (HSTS) forces HTTPS; X-Frame-Options/frame-ancestors prevent clickjacking; X-Content-Type-Options stops MIME sniffing. Set them consistently and use a strict, tested CSP as a strong second line of defense against injection.' },
  { keys: ['waf', 'web application firewall', 'firewall'], title: 'Web Application Firewall (WAF)',
    text: 'A WAF sits in front of an application and filters HTTP traffic, blocking common attack patterns like SQL injection and XSS based on rules or signatures. It provides a useful layer of defense and virtual patching for known issues, but can be bypassed and generates false positives. Treat it as defense in depth, not a substitute for fixing vulnerabilities in code.' },
  { keys: ['sast', 'dast', 'sca', 'static analysis', 'dynamic analysis', 'security testing'], title: 'Security Testing (SAST/DAST/SCA)',
    text: 'SAST (Static Application Security Testing) scans source code for vulnerabilities without running it; DAST (Dynamic) tests a running application from the outside like an attacker; SCA (Software Composition Analysis) finds known-vulnerable dependencies. They are complementary — use all three plus manual review and penetration testing, and integrate them into CI/CD to catch issues early.' },
  { keys: ['penetration testing', 'pentest', 'red team', 'ethical hacking'], title: 'Penetration Testing',
    text: 'A penetration test simulates a real attacker to find and safely exploit vulnerabilities before malicious actors do, validating defenses in practice. Red teaming goes further, testing detection and response across people, process, and technology. Pentests should be scoped, authorized in writing, and followed by remediation and retesting; they complement, not replace, automated scanning.' },
  { keys: ['patch management', 'patching', 'updates', 'zero day'], title: 'Patch Management',
    text: 'Patch management is the disciplined process of tracking, testing, and applying security updates to systems and dependencies promptly, since most breaches exploit known, already-patched flaws. Prioritize by severity and exploitability, maintain an asset inventory, and automate where possible. A zero-day is a flaw exploited before a patch exists, requiring compensating controls until fixed.' },
  { keys: ['zero trust', 'never trust always verify', 'microsegmentation'], title: 'Zero Trust',
    text: 'Zero Trust is a security model that assumes no user, device, or network is inherently trusted — "never trust, always verify." Every access request is authenticated, authorized, and encrypted regardless of location, with continuous verification and least-privilege access. It replaces the old perimeter model, using strong identity, device posture checks, and microsegmentation to limit lateral movement.' },
  { keys: ['csrf token', 'anti csrf', 'samesite cookie'], title: 'CSRF Tokens & SameSite',
    text: 'Anti-CSRF tokens are unpredictable per-session (or per-request) values embedded in forms and verified server-side, so a forged cross-site request cannot supply the correct token. The SameSite cookie attribute (Lax or Strict) tells browsers not to send cookies on cross-site requests, providing a strong complementary defense. Use both, and require re-authentication for the most sensitive operations.' },
  { keys: ['cors', 'cross origin resource sharing', 'same origin policy'], title: 'CORS & Same-Origin Policy',
    text: 'The Same-Origin Policy stops a page from reading responses from a different origin by default. CORS (Cross-Origin Resource Sharing) is a controlled relaxation, where a server uses headers like Access-Control-Allow-Origin to permit specific origins. Misconfigured CORS — reflecting any origin or allowing credentials with a wildcard — can leak sensitive data, so allow-list origins explicitly and avoid overly permissive settings.' },
  { keys: ['rbac', 'abac', 'role based access', 'attribute based access'], title: 'RBAC & ABAC',
    text: 'Role-Based Access Control (RBAC) grants permissions based on a user\'s role (admin, editor, viewer), simplifying management at scale. Attribute-Based Access Control (ABAC) makes finer-grained decisions using attributes of the user, resource, action, and context (time, location). Both must be enforced server-side; RBAC is simpler while ABAC is more flexible for complex policies.' },
  { keys: ['secure sdlc', 'devsecops', 'shift left', 'security development lifecycle'], title: 'Secure SDLC / DevSecOps',
    text: 'A Secure Software Development Lifecycle builds security into every phase — requirements, design (threat modeling), coding (secure standards, reviews), testing (SAST/DAST), and operations (monitoring, patching). DevSecOps "shifts security left," automating checks in CI/CD so issues are caught early and cheaply rather than after release. Security becomes a shared, continuous responsibility, not a final gate.' },

  // ---- Vulnerability management: CVE / CVSS ----
  { keys: ['cve', 'common vulnerabilities and exposures', 'cve id'], title: 'CVE (Common Vulnerabilities and Exposures)',
    text: 'CVE is a public catalog that assigns a unique identifier (e.g., CVE-YYYY-NNNNN) to each publicly known security vulnerability, giving everyone a common reference. It standardizes how flaws are named and tracked across tools, advisories, and databases. CVE records describe the affected product and issue but do not themselves rank severity — that is CVSS. (Live CVE data comes from external feeds, not this knowledge base.)' },
  { keys: ['cvss', 'common vulnerability scoring system', 'severity score', 'base score'], title: 'CVSS (Scoring System)',
    text: 'CVSS is the Common Vulnerability Scoring System, a standard that rates a vulnerability\'s severity on a 0–10 scale from metrics like attack vector, complexity, privileges required, and impact to confidentiality/integrity/availability. Scores map to ratings: Low (0.1–3.9), Medium (4.0–6.9), High (7.0–8.9), and Critical (9.0–10.0). It helps teams prioritize which vulnerabilities to fix first.' },
  { keys: ['cwe', 'common weakness enumeration', 'weakness class'], title: 'CWE (Common Weakness Enumeration)',
    text: 'CWE is a community-maintained catalog of software and hardware weakness types (e.g., CWE-79 for XSS, CWE-89 for SQL injection), describing the root-cause categories that lead to vulnerabilities. While a CVE names a specific instance in a product, a CWE names the underlying flaw class. CWE helps developers understand and systematically prevent recurring weaknesses.' },
  { keys: ['vulnerability management', 'vuln management', 'remediation', 'prioritization'], title: 'Vulnerability Management',
    text: 'Vulnerability management is the continuous process of identifying, classifying, prioritizing, remediating, and verifying security weaknesses across systems. It combines asset inventory, scanning, severity scoring (CVSS) and exploitability/threat context to decide what to fix first, since not everything can be patched at once. Effective programs track metrics like time-to-remediate and coverage.' },
  { keys: ['threat modeling', 'stride', 'attack surface', 'threat model'], title: 'Threat Modeling',
    text: 'Threat modeling is a structured exercise to identify potential threats, attack surfaces, and mitigations early in design, before code is written. Frameworks like STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege) prompt teams to reason about what can go wrong. It turns security from reactive patching into proactive design.' },
  { keys: ['responsible disclosure', 'bug bounty', 'coordinated disclosure', 'vulnerability disclosure'], title: 'Responsible Disclosure & Bug Bounties',
    text: 'Responsible (coordinated) disclosure is the practice where security researchers report vulnerabilities privately to the vendor and allow time to fix before public release. Bug bounty programs formalize this by rewarding researchers for valid reports. A clear vulnerability disclosure policy and safe-harbor terms encourage ethical reporting instead of exploitation or full disclosure.' },

  // ---- Compliance & privacy ----
  { keys: ['pii', 'personally identifiable information', 'sensitive data', 'personal data'], title: 'PII (Personally Identifiable Information)',
    text: 'PII is any data that can identify a specific individual — name, email, phone, government ID, financial or biometric data, IP address in some contexts. It must be minimized (collect only what is needed), protected with encryption and access controls, and handled per privacy laws. Breaches of PII carry legal, financial, and reputational consequences, so limiting exposure is a core security duty.' },
  { keys: ['gdpr', 'general data protection regulation', 'data subject rights', 'privacy law'], title: 'GDPR (Concepts)',
    text: 'The GDPR is the EU\'s data-protection regulation establishing principles like lawful basis for processing, data minimization, purpose limitation, and accountability. It grants individuals rights such as access, rectification, erasure ("right to be forgotten"), and portability, and requires breach notification (often within 72 hours). Non-compliance can bring heavy fines, so privacy-by-design and consent management are essential.' },
  { keys: ['audit log', 'audit trail', 'logging', 'tamper evident logs'], title: 'Audit Logs',
    text: 'An audit log is a chronological, tamper-evident record of security-relevant events — logins, permission changes, data access, admin actions — capturing who did what, when, and from where. It is essential for detecting breaches, forensic investigation, and compliance. Protect logs from tampering (append-only, centralized, access-controlled), retain them appropriately, and avoid logging secrets or full PII.' },
  { keys: ['data minimization', 'privacy by design', 'purpose limitation', 'retention'], title: 'Data Minimization & Privacy by Design',
    text: 'Data minimization means collecting and retaining only the personal data strictly necessary for a defined purpose, then deleting it when no longer needed. Privacy by design builds these protections into systems from the start rather than bolting them on. Combined with purpose limitation and retention policies, they reduce breach impact and support compliance with laws like GDPR.' },
  { keys: ['data breach', 'breach response', 'incident response', 'breach notification'], title: 'Data Breach & Incident Response',
    text: 'A data breach is unauthorized access to or disclosure of sensitive data. Incident response is the planned process to handle it: prepare, detect/identify, contain, eradicate, recover, and conduct a post-incident review ("lessons learned"). Many regulations require notifying affected users and authorities within set timeframes, so a tested plan and clear roles are critical to limit damage.' },
  { keys: ['compliance', 'soc2', 'iso 27001', 'hipaa', 'pci dss'], title: 'Compliance Frameworks',
    text: 'Security compliance frameworks define controls organizations must implement and prove: SOC 2 (trust criteria for service providers), ISO 27001 (information security management systems), HIPAA (US health data), and PCI DSS (payment card data). Compliance demonstrates due diligence to customers and regulators, but it is a baseline — being compliant is not the same as being secure.' },
  { keys: ['data classification', 'sensitivity levels', 'confidential', 'classification'], title: 'Data Classification',
    text: 'Data classification labels information by sensitivity — for example public, internal, confidential, and restricted — so that appropriate controls (encryption, access, retention, handling) can be applied to each level. It ensures the most sensitive data gets the strongest protection without over-securing everything. Classification underpins access control, DLP, and compliance decisions.' },
  { keys: ['gdpr consent', 'consent', 'opt in', 'cookie consent', 'lawful basis'], title: 'Consent & Lawful Basis',
    text: 'Under privacy laws like GDPR, processing personal data requires a lawful basis, one of which is freely given, specific, informed, and unambiguous consent that can be withdrawn as easily as it was given. Consent must not be bundled or pre-ticked, and records of consent should be kept. Other lawful bases include contract, legal obligation, and legitimate interest.' },
  { keys: ['pci dss', 'payment card', 'cardholder data', 'card security'], title: 'PCI DSS (Payment Security)',
    text: 'PCI DSS (Payment Card Industry Data Security Standard) is a set of requirements for any organization that stores, processes, or transmits cardholder data, covering network security, encryption, access control, monitoring, and testing. A key strategy is reducing scope — e.g., using tokenization or a payment processor so raw card data never touches your systems. Non-compliance risks fines and loss of the ability to process cards.' },
  { keys: ['dlp', 'data loss prevention', 'exfiltration'], title: 'Data Loss Prevention (DLP)',
    text: 'Data Loss Prevention refers to tools and policies that detect and block sensitive data (PII, secrets, financial records) from leaving the organization through email, uploads, USB, or other channels. DLP relies on data classification and content inspection to enforce handling rules. It helps prevent both accidental leaks and malicious exfiltration, complementing access control and encryption.' },

  // ---- General security concepts ----
  { keys: ['cia triad', 'confidentiality integrity availability', 'security triad'], title: 'CIA Triad',
    text: 'The CIA triad is the foundational model of information security: Confidentiality (only authorized parties can read data), Integrity (data is accurate and unaltered), and Availability (systems and data are accessible when needed). Every security control ultimately serves one or more of these goals, and threats are often categorized by which pillar they attack.' },
  { keys: ['phishing', 'social engineering', 'spear phishing', 'pretexting'], title: 'Phishing & Social Engineering',
    text: 'Social engineering manipulates people rather than technology into revealing information or performing unsafe actions; phishing (via email), spear phishing (targeted), vishing (voice), and pretexting are common forms. Since humans are often the weakest link, defenses include security awareness training, MFA, email filtering and DMARC, verification procedures for sensitive requests, and a blame-free reporting culture.' },
  { keys: ['malware', 'ransomware', 'trojan', 'virus', 'spyware'], title: 'Malware & Ransomware',
    text: 'Malware is malicious software — viruses, worms, trojans, spyware, and ransomware — designed to damage, steal, or control systems. Ransomware encrypts a victim\'s data and demands payment for the key, and is a leading threat to organizations. Defenses include patching, least privilege, email/web filtering, endpoint detection, network segmentation, and tested offline backups for recovery.' },
  { keys: ['privilege escalation', 'lateral movement', 'vertical escalation', 'horizontal escalation'], title: 'Privilege Escalation',
    text: 'Privilege escalation is when an attacker gains higher access than intended — vertical (a normal user becoming admin/root) or horizontal (accessing another user\'s data at the same level). It typically follows an initial foothold and enables deeper compromise and lateral movement. Prevent it with least privilege, patching, strong access controls, and monitoring for anomalous privilege use.' },
  { keys: ['man in the middle', 'mitm', 'eavesdropping', 'interception'], title: 'Man-in-the-Middle (MITM)',
    text: 'A man-in-the-middle attack intercepts communication between two parties to eavesdrop or alter messages, often on untrusted networks (public Wi-Fi) or via ARP/DNS spoofing. TLS with valid certificates is the primary defense, ensuring data is encrypted and the server\'s identity is verified. Certificate pinning and HSTS further reduce the risk of interception and downgrade attacks.' },
  { keys: ['backup', 'backups', '3 2 1 backup', 'disaster recovery', 'business continuity'], title: 'Backups & Disaster Recovery',
    text: 'Reliable, tested backups are the last line of defense against ransomware, corruption, and disasters. The 3-2-1 rule keeps three copies, on two different media, with one offsite (and ideally one offline/immutable). Backups must be restored-tested regularly and protected from attackers, since ransomware often targets backups first; recovery objectives (RPO/RTO) define acceptable data loss and downtime.' },
  { keys: ['sanitization vs validation', 'escaping', 'encoding vs escaping'], title: 'Sanitization, Validation & Escaping',
    text: 'Validation checks that input meets expected rules and rejects what does not; sanitization cleans/modifies input to remove dangerous parts; escaping/encoding transforms data so it is treated as literal text in a target context (HTML, SQL, shell). They serve different purposes and are often combined — but the most robust injection defense is using safe APIs (parameterized queries, auto-escaping templates) rather than manual sanitization.' },
  { keys: ['security through obscurity', 'obscurity', 'hidden not secure'], title: 'Security Through Obscurity',
    text: 'Security through obscurity relies on keeping the design or implementation secret as the primary defense, which is weak because secrets leak and the protection collapses once discovered. Real security must hold even when the attacker knows the system (Kerckhoffs\'s principle) — only the keys should be secret. Obscurity can be a minor extra layer but never the main control.' }
];

function lookup(query) {
  const raw = String(query || '').toLowerCase();
  const q = words(query);
  if (!q.length) return null;
  const qset = new Set(q);

  let best = null;
  let bestScore = 0;

  for (const e of entries) {
    let score = 0;
    // Key matches are strongest signal.
    for (const key of e.keys) {
      const kl = key.toLowerCase();
      const kws = kl.split(/\s+/);
      // strongest: the whole key phrase appears verbatim in the query string
      if (kws.length > 1 && raw.includes(kl)) score += 8 * kws.length;
      // all key words present (any order, stopwords in the key ignored)
      else if (kws.filter(w => !STOP.has(w)).every(w => qset.has(w))) score += 6 * kws.length;
      else {
        for (const w of kws) if (!STOP.has(w) && qset.has(w)) score += 3;
      }
    }
    // Title word matches.
    for (const w of words(e.title)) if (qset.has(w)) score += 2;
    // Body word overlap (light weight).
    const bodyWords = new Set(words(e.text));
    for (const w of q) if (bodyWords.has(w)) score += 0.4;

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }

  if (!best || bestScore < 2) return null;
  return { title: best.title, text: best.text };
}

module.exports = {
  agent: 'PIKADON',
  domains: [
    'owasp', 'vulnerabilities', 'authentication', 'cryptography',
    'secure-coding', 'secret-management', 'vulnerability-management',
    'compliance', 'privacy', 'incident-response'
  ],
  entries,
  lookup
};
