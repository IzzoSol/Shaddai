// nexus-kb.js — Local, self-contained knowledge base for the NEXUS agent (Technical Architect).
// No network, no APIs, no dependencies. Pure evergreen software-engineering knowledge.
// Contract: { agent, domains, entries:[{keys,title,text}], lookup(query) }

const entries = [
  // ---------------------------------------------------------------- ARCHITECTURE
  {
    keys: ['monolith', 'monolithic', 'monolith vs microservices', 'single deployable'],
    title: 'Monolithic Architecture',
    text: 'A monolith packages all application logic into a single deployable unit that shares one process, codebase, and database. It is simpler to develop, test, and deploy early on, with no network hops between modules and easy end-to-end transactions. The downside is that it scales as one block, a single bug or memory leak can take everything down, and large teams contend over the same codebase. Start with a well-modularized monolith and extract services only when a clear scaling or team-boundary need appears.'
  },
  {
    keys: ['microservices', 'microservice', 'service oriented', 'soa', 'distributed services'],
    title: 'Microservices Architecture',
    text: 'Microservices split a system into small, independently deployable services, each owning its own data and communicating over the network (REST, gRPC, or messaging). Benefits include independent scaling, technology diversity, fault isolation, and team autonomy. Costs include network latency, distributed-transaction complexity, harder debugging, and operational overhead (service discovery, observability, versioning). Prefer them once you have real scaling pressure and multiple teams; premature microservices add distributed-systems pain without payoff.'
  },
  {
    keys: ['event driven', 'event driven architecture', 'eda', 'events', 'event sourcing'],
    title: 'Event-Driven Architecture',
    text: 'In event-driven architecture, components emit and react to events rather than calling each other directly, decoupling producers from consumers. It enables asynchronous processing, easy fan-out, and resilience since consumers can be added without changing producers. Patterns include event notification, event-carried state transfer, and event sourcing (persisting state as an append-only log of events). Trade-offs are eventual consistency, harder end-to-end tracing, and the need for idempotent consumers to handle duplicate or out-of-order events.'
  },
  {
    keys: ['mvc', 'model view controller', 'layered architecture', 'separation of concerns'],
    title: 'MVC and Layered Architecture',
    text: 'MVC separates concerns into Model (data and business rules), View (presentation), and Controller (input handling and coordination). Layered architecture generalizes this into presentation, application/service, domain, and persistence layers, where each layer only depends on the one below it. The goal is testability and changeability: you can swap a database or UI without touching business logic. Avoid leaking persistence details into the domain and keep controllers thin.'
  },
  {
    keys: ['rest', 'restful', 'rest api', 'representational state transfer'],
    title: 'REST APIs',
    text: 'REST models the system as resources identified by URLs, manipulated with standard HTTP verbs (GET, POST, PUT, PATCH, DELETE) and stateless requests. It is simple, cacheable, uses ubiquitous HTTP tooling, and is ideal for CRUD-style public APIs. Weaknesses are over-fetching and under-fetching (fixed response shapes) and needing multiple round-trips for related data. Good REST uses nouns for resources, proper status codes, and hypermedia links where helpful.'
  },
  {
    keys: ['graphql', 'graph ql', 'query language api'],
    title: 'GraphQL',
    text: 'GraphQL exposes a single endpoint with a typed schema where clients request exactly the fields they need, solving REST over/under-fetching. It is excellent for complex, nested data and for many client types (web, mobile) with differing needs. Costs include server-side complexity, harder HTTP caching, and the N+1 query problem that requires batching (e.g., DataLoader). It also needs query cost analysis and depth limiting to prevent abusive queries.'
  },
  {
    keys: ['grpc', 'g rpc', 'protobuf', 'protocol buffers', 'rpc'],
    title: 'gRPC',
    text: 'gRPC is a high-performance RPC framework using HTTP/2 and Protocol Buffers for compact binary serialization and strongly-typed contracts. It supports streaming (client, server, bidirectional), is fast and low-latency, and is ideal for internal service-to-service communication. Downsides are limited native browser support (needs a proxy like grpc-web), less human-readable payloads, and steeper tooling. Use gRPC for internal microservice traffic and REST/GraphQL for public-facing APIs.'
  },
  {
    keys: ['rest vs graphql', 'rest vs graphql vs grpc', 'api style comparison', 'which api', 'rest graphql grpc'],
    title: 'REST vs GraphQL vs gRPC',
    text: 'REST is the simplest and most universal choice for public CRUD APIs, with great caching and tooling but fixed response shapes. GraphQL gives clients precise control over returned fields and is best for complex, nested data across diverse clients, at the cost of caching and server complexity. gRPC is the fastest, using HTTP/2 and binary Protobuf, and is best for internal service-to-service calls and streaming, but lacks easy browser support. Rule of thumb: REST for public APIs, GraphQL for flexible client data needs, gRPC for internal high-performance traffic.'
  },
  {
    keys: ['pub sub', 'publish subscribe', 'pubsub', 'topics', 'fan out'],
    title: 'Publish/Subscribe (Pub/Sub)',
    text: 'Pub/Sub decouples senders (publishers) from receivers (subscribers) via topics: publishers emit messages to a topic without knowing who consumes them. It enables one-to-many fan-out, easy addition of new consumers, and asynchronous scaling. Consider delivery guarantees (at-least-once vs exactly-once), ordering, and the need for idempotent subscribers. Common implementations include Redis Pub/Sub, Kafka topics, NATS, and cloud services like SNS/SQS or Google Pub/Sub.'
  },
  {
    keys: ['message queue', 'queue', 'queues', 'work queue', 'rabbitmq', 'sqs', 'kafka'],
    title: 'Message Queues',
    text: 'A message queue buffers work between producers and consumers so they run at independent rates, smoothing spikes and enabling asynchronous processing. Queues give durability, retry, and back-pressure, and let you scale consumers horizontally. Key concerns are delivery semantics (at-least-once is common, so make consumers idempotent), ordering, dead-letter queues for poison messages, and visibility timeouts. Kafka is a durable log for high-throughput streaming; RabbitMQ/SQS are classic task queues.'
  },
  {
    keys: ['cqrs', 'command query responsibility segregation', 'read model write model'],
    title: 'CQRS',
    text: 'CQRS (Command Query Responsibility Segregation) separates the write model (commands that change state) from the read model (queries that return data), often with different data stores optimized for each. It lets you scale reads and writes independently and shape read models for specific views. It pairs well with event sourcing but adds complexity and eventual consistency between models, so apply it only to high-value, high-load subdomains rather than the whole system.'
  },
  {
    keys: ['hexagonal', 'ports and adapters', 'clean architecture', 'onion architecture', 'dependency inversion'],
    title: 'Hexagonal / Clean Architecture',
    text: 'Hexagonal (ports-and-adapters) and clean architecture keep business logic at the center, independent of frameworks, databases, and UI. The domain defines ports (interfaces); adapters implement them for specific technologies, so infrastructure depends on the domain, not vice versa (dependency inversion). This maximizes testability and makes swapping databases or delivery mechanisms cheap. The cost is more boilerplate and indirection, which is worth it for long-lived core domains.'
  },
  {
    keys: ['api gateway', 'gateway', 'bff', 'backend for frontend', 'edge'],
    title: 'API Gateway & BFF',
    text: 'An API gateway is a single entry point in front of many services that handles cross-cutting concerns: routing, authentication, rate limiting, TLS termination, and request aggregation. A Backend-for-Frontend (BFF) is a gateway tailored to one client type (web, mobile) that shapes and aggregates data for that UI. Gateways reduce client complexity but can become a bottleneck or a new monolith, so keep business logic out of them.'
  },
  {
    keys: ['saga', 'distributed transaction', 'two phase commit', 'compensating transaction'],
    title: 'Sagas & Distributed Transactions',
    text: 'Because microservices each own their data, you cannot use a single ACID transaction across them; the saga pattern coordinates a sequence of local transactions with compensating actions to undo on failure. Orchestration uses a central coordinator; choreography uses events where each service reacts and emits the next event. Sagas provide eventual consistency, not atomicity, so design idempotent steps and clear compensation logic.'
  },

  // ---------------------------------------------------------------- APIs
  {
    keys: ['http methods', 'http verbs', 'get post put patch delete', 'verbs', 'safe methods'],
    title: 'HTTP Methods',
    text: 'GET reads a resource and must be safe (no side effects) and idempotent. POST creates or triggers actions and is neither safe nor idempotent. PUT replaces a resource fully and is idempotent; PATCH applies a partial update. DELETE removes a resource and is idempotent. Choosing correct verbs enables caching, retries, and predictable proxy/CDN behavior.'
  },
  {
    keys: ['status codes', 'http status', 'response codes', '200 404 500', 'error codes'],
    title: 'HTTP Status Codes',
    text: '2xx means success (200 OK, 201 Created, 204 No Content). 3xx means redirection (301 permanent, 302 found, 304 Not Modified for caching). 4xx means client error (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests). 5xx means server error (500 Internal, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout). Use precise codes so clients and proxies can react correctly.'
  },
  {
    keys: ['idempotency', 'idempotent', 'idempotency key', 'retry safe', 'exactly once'],
    title: 'Idempotency',
    text: 'An idempotent operation produces the same result whether performed once or many times, which is essential for safe retries over unreliable networks. GET, PUT, and DELETE are idempotent by definition; POST is not, so payment and order APIs accept an idempotency key so the server can detect and dedupe retried requests. Store the key with the first response and return that cached response on repeats. This prevents double charges and duplicate records.'
  },
  {
    keys: ['rate limiting', 'rate limit', 'throttling', 'token bucket', 'leaky bucket', '429'],
    title: 'Rate Limiting',
    text: 'Rate limiting caps how many requests a client can make in a window to protect capacity and ensure fairness. Common algorithms are token bucket (allows bursts up to a bucket size, refills at a steady rate), leaky bucket (smooths to a fixed output rate), fixed window, and sliding window (more accurate at window edges). Return HTTP 429 with Retry-After and rate-limit headers, and apply limits per API key, user, or IP.'
  },
  {
    keys: ['pagination', 'paging', 'offset pagination', 'cursor pagination', 'keyset'],
    title: 'API Pagination',
    text: 'Pagination breaks large result sets into pages. Offset/limit pagination is simple but slow on deep pages and can skip or duplicate rows when data changes. Cursor (keyset) pagination uses a stable pointer (e.g., last id or timestamp) to fetch the next page efficiently and consistently, which is preferred for large or frequently changing datasets. Always cap page size and return the next cursor plus a has-more indicator.'
  },
  {
    keys: ['webhooks', 'webhook', 'callbacks', 'event notification http', 'signature verification'],
    title: 'Webhooks',
    text: 'A webhook is an HTTP callback where your server POSTs an event to a client-registered URL instead of the client polling. Design for reliability: sign payloads (HMAC) so receivers can verify authenticity, retry with exponential backoff on failure, and include an event id so receivers can dedupe. Receivers should respond quickly (2xx) and process asynchronously, treating handlers as idempotent because duplicates will occur.'
  },
  {
    keys: ['auth', 'authentication', 'authorization', 'oauth', 'jwt', 'api keys', 'bearer token'],
    title: 'API Authentication & Authorization',
    text: 'Authentication proves who you are; authorization decides what you may do. API keys are simple shared secrets good for server-to-server. OAuth 2.0 delegates access via tokens without sharing passwords, and OIDC adds identity on top. JWTs are self-contained signed tokens carrying claims, fast to verify but hard to revoke before expiry, so keep them short-lived and pair with refresh tokens. Always send credentials over TLS and scope tokens to least privilege.'
  },
  {
    keys: ['api versioning', 'versioning', 'v1 v2', 'backward compatibility', 'breaking change'],
    title: 'API Versioning',
    text: 'Versioning lets you evolve an API without breaking existing clients. Common approaches are URL path (/v1/), header, or media-type versioning. Prefer additive, backward-compatible changes (new optional fields) so you rarely need a new version; treat removing or renaming fields as breaking. Communicate deprecation timelines and support old versions during a transition window.'
  },
  {
    keys: ['rest maturity', 'hateoas', 'richardson maturity', 'hypermedia', 'restful design'],
    title: 'REST Design & HATEOAS',
    text: 'Good REST design uses plural resource nouns, nests relationships sparingly, filters/sorts via query params, and returns consistent error bodies. HATEOAS (hypermedia) embeds links in responses so clients can discover available actions dynamically rather than hardcoding URLs. Most APIs stop short of full HATEOAS, but consistent, predictable resource modeling and correct status codes deliver most of REST value.'
  },
  {
    keys: ['cors', 'cross origin', 'preflight', 'same origin policy'],
    title: 'CORS',
    text: 'CORS (Cross-Origin Resource Sharing) is a browser mechanism that lets a server allow requests from origins other than its own via Access-Control-Allow-Origin headers. Non-simple requests trigger a preflight OPTIONS request the server must answer with allowed methods and headers. CORS is enforced by browsers, not servers, so it is not a substitute for authentication; server-to-server calls are unaffected.'
  },
  {
    keys: ['content negotiation', 'accept header', 'compression', 'gzip', 'etag'],
    title: 'Content Negotiation & Caching Headers',
    text: 'Clients use the Accept header to request a representation (JSON, XML) and the server responds with a matching Content-Type. Response compression (gzip, brotli) shrinks payloads when the client signals Accept-Encoding. Caching headers like ETag and Last-Modified enable conditional requests (If-None-Match) that return 304 Not Modified, saving bandwidth, while Cache-Control governs freshness.'
  },

  // ---------------------------------------------------------------- DATABASES
  {
    keys: ['sql vs nosql', 'sql or nosql', 'relational vs nosql', 'database choice', 'nosql'],
    title: 'SQL vs NoSQL',
    text: 'SQL (relational) databases use fixed schemas, joins, and strong ACID transactions, ideal when data is structured and relationships and consistency matter (finance, orders). NoSQL covers document (MongoDB), key-value (Redis, DynamoDB), wide-column (Cassandra), and graph stores, trading strict schemas and joins for flexible models and easy horizontal scaling. Choose SQL by default for transactional integrity; reach for NoSQL for massive scale, flexible/denormalized data, or specific access patterns. Many systems use both (polyglot persistence).'
  },
  {
    keys: ['indexing', 'index', 'database index', 'b-tree', 'covering index', 'composite index'],
    title: 'Database Indexing',
    text: 'An index is a sorted data structure (usually a B-tree) that lets the database find rows without scanning the whole table, turning O(n) scans into O(log n) lookups. Index columns used in WHERE, JOIN, and ORDER BY; composite indexes help multi-column filters but only when queries use a left-to-right prefix of the columns. Indexes speed reads but slow writes and use storage, so index deliberately. A covering index includes all columns a query needs so it never touches the table.'
  },
  {
    keys: ['acid', 'atomicity consistency isolation durability', 'transactions', 'acid properties'],
    title: 'ACID Properties',
    text: 'ACID guarantees reliable transactions: Atomicity (all-or-nothing), Consistency (transactions move the DB between valid states honoring constraints), Isolation (concurrent transactions do not corrupt each other), and Durability (committed data survives crashes). Isolation levels (Read Committed, Repeatable Read, Serializable) trade concurrency for correctness, preventing anomalies like dirty reads, non-repeatable reads, and phantoms. Stronger isolation is safer but reduces throughput.'
  },
  {
    keys: ['transactions', 'transaction', 'commit rollback', 'locking', 'mvcc', 'optimistic locking'],
    title: 'Transactions & Concurrency Control',
    text: 'A transaction groups operations so they succeed or fail together (commit or rollback). Databases control concurrency with locking (pessimistic: lock rows before writing) or MVCC (multi-version concurrency control: readers see a snapshot, writers create new versions), which avoids read-write blocking. Optimistic locking uses a version column to detect conflicting concurrent updates at commit time. Keep transactions short to reduce lock contention and deadlock risk.'
  },
  {
    keys: ['normalization', 'denormalization', 'normal forms', '3nf', 'schema design'],
    title: 'Normalization & Denormalization',
    text: 'Normalization organizes data to eliminate redundancy: 1NF (atomic values), 2NF (no partial key dependencies), 3NF (no transitive dependencies), so each fact lives in exactly one place, preventing update anomalies. Denormalization deliberately duplicates data to avoid expensive joins and speed reads, at the cost of update complexity and consistency risk. Normalize for write-heavy transactional systems; denormalize selectively for read-heavy analytics or NoSQL access patterns.'
  },
  {
    keys: ['redis', 'caching', 'cache', 'in memory cache', 'cache aside', 'ttl', 'memcached'],
    title: 'Redis & Caching Strategies',
    text: 'Redis is an in-memory key-value store used for caching, sessions, rate limiting, queues, and pub/sub, offering sub-millisecond reads. The cache-aside pattern (lazy loading) checks the cache first, then loads from the database and populates the cache on a miss; write-through updates cache and DB together. Always set TTLs to bound staleness and memory, and plan for cache invalidation and the thundering-herd problem when many keys expire at once. Caching trades consistency for latency and reduced database load.'
  },
  {
    keys: ['cache invalidation', 'stale cache', 'write through', 'write behind', 'cache stampede'],
    title: 'Cache Invalidation',
    text: 'Cache invalidation keeps cached data from going stale. Strategies include TTL expiry (simple, bounded staleness), explicit invalidation on write, write-through (write to cache and DB together), and write-behind (write to cache, async to DB). Guard against cache stampedes with request coalescing, jittered TTLs, or a short lock so only one request rebuilds a hot key. Remember the adage: cache invalidation is one of the two hard problems in computing.'
  },
  {
    keys: ['connection pool', 'connection pooling', 'db pool', 'pool size'],
    title: 'Connection Pooling',
    text: 'Opening a new database connection per request is expensive (TCP + auth handshake), so a connection pool keeps a set of reusable open connections. Requests borrow a connection, use it, and return it, bounding total connections to protect the database. Size the pool to the database max connections and your concurrency; too large overwhelms the DB, too small creates a bottleneck. Watch for leaked connections that are never returned.'
  },
  {
    keys: ['replication', 'read replica', 'primary replica', 'leader follower', 'failover'],
    title: 'Database Replication',
    text: 'Replication copies data from a primary (leader) to one or more replicas (followers) for read scaling and high availability. Async replication is fast but replicas can lag, causing stale reads; sync replication is consistent but slower. Route reads to replicas and writes to the primary, and on primary failure promote a replica (failover). Beware read-your-own-writes issues caused by replication lag.'
  },
  {
    keys: ['n plus one', 'n+1', 'n+1 query', 'eager loading', 'lazy loading', 'query batching'],
    title: 'N+1 Query Problem',
    text: 'The N+1 problem happens when code runs one query to fetch a list, then one additional query per item to fetch related data, producing N+1 round-trips instead of a few. It is common with ORMs doing lazy loading and with naive GraphQL resolvers. Fix it with eager loading (a JOIN or IN query), batching (DataLoader), or explicit prefetch. It is a top cause of slow endpoints under real data volumes.'
  },
  {
    keys: ['migrations', 'schema migration', 'database migration', 'zero downtime migration'],
    title: 'Schema Migrations',
    text: 'Migrations version-control database schema changes so they apply consistently across environments. For zero-downtime, use expand-then-contract: add new columns/tables (backward compatible), backfill data, deploy code using both, then remove the old schema once nothing references it. Avoid long-locking operations on large tables; add indexes concurrently where supported. Always make migrations reversible or forward-only with tested rollbacks.'
  },

  // ---------------------------------------------------------------- SCALING
  {
    keys: ['horizontal scaling', 'vertical scaling', 'scale out', 'scale up', 'scaling'],
    title: 'Horizontal vs Vertical Scaling',
    text: 'Vertical scaling (scale up) adds more CPU/RAM to one machine: simple but has a hard ceiling and a single point of failure. Horizontal scaling (scale out) adds more machines behind a load balancer: nearly unlimited and fault-tolerant, but requires stateless services and shared or partitioned data. Prefer horizontal scaling for web tiers by keeping app servers stateless (store sessions in Redis/DB) so any instance can serve any request.'
  },
  {
    keys: ['load balancing', 'load balancer', 'round robin', 'least connections', 'sticky sessions'],
    title: 'Load Balancing',
    text: 'A load balancer distributes traffic across many server instances to spread load and provide failover via health checks. Algorithms include round-robin, least-connections, and hashing (for affinity). Layer 4 balances by TCP/IP; Layer 7 balances by HTTP content (paths, headers). Sticky sessions pin a user to one server but hurt even distribution and resilience, so prefer stateless servers with externalized session state.'
  },
  {
    keys: ['cdn', 'content delivery network', 'edge cache', 'static assets', 'edge'],
    title: 'CDN (Content Delivery Network)',
    text: 'A CDN caches content on edge servers geographically close to users, cutting latency and offloading your origin. It is ideal for static assets (images, JS, CSS, video) and increasingly for cached API responses and edge compute. Control caching with Cache-Control and versioned/hashed filenames for safe cache-busting, and use purge/invalidation when content changes. CDNs also absorb traffic spikes and provide DDoS protection.'
  },
  {
    keys: ['sharding', 'shard', 'partitioning', 'horizontal partitioning', 'shard key'],
    title: 'Sharding & Partitioning',
    text: 'Sharding splits a dataset across multiple databases (shards) so each holds a subset, enabling writes to scale beyond one machine. The shard key determines placement; a good key spreads load evenly and keeps related data together, while a bad key creates hotspots. Range sharding is simple but can hotspot; hash sharding spreads evenly but complicates range queries. Sharding adds complexity: cross-shard joins/transactions are hard, and resharding is painful, so delay it until vertical scaling and read replicas are exhausted.'
  },
  {
    keys: ['eventual consistency', 'strong consistency', 'consistency model', 'read your writes'],
    title: 'Consistency Models',
    text: 'Strong consistency guarantees every read returns the latest write, which is simplest to reason about but costs latency and availability in distributed systems. Eventual consistency allows replicas to converge over time, so reads may be briefly stale but the system stays fast and available. In between are read-your-writes, monotonic reads, and causal consistency. Choose based on the use case: money needs strong consistency; likes/feeds tolerate eventual.'
  },
  {
    keys: ['cap theorem', 'cap', 'consistency availability partition', 'pacelc'],
    title: 'CAP Theorem',
    text: 'The CAP theorem states that during a network partition a distributed system must choose between Consistency (every read sees the latest write) and Availability (every request gets a response). Since partitions are unavoidable, systems are effectively CP (reject some requests to stay consistent, e.g., many SQL clusters) or AP (stay available but may serve stale data, e.g., Dynamo-style stores). PACELC extends this: even without partitions, you trade latency vs consistency.'
  },
  {
    keys: ['stateless', 'stateless service', 'session state', 'externalize state'],
    title: 'Stateless Services',
    text: 'A stateless service keeps no client session data in local memory, so any instance can handle any request, which is the foundation of horizontal scaling and easy failover. Externalize state to shared stores (Redis for sessions, a database for data, object storage for files). Statelessness also simplifies deployments and auto-scaling because instances are interchangeable and disposable.'
  },
  {
    keys: ['autoscaling', 'auto scaling', 'elastic', 'scale to zero', 'capacity planning'],
    title: 'Autoscaling',
    text: 'Autoscaling adds or removes instances automatically based on metrics like CPU, request rate, or queue depth, matching capacity to demand and cost. Set sensible min/max bounds, use cooldowns to avoid flapping, and scale on leading indicators (queue length) rather than lagging ones. It requires stateless, fast-starting services and health checks; slow boot times undermine responsiveness during spikes.'
  },
  {
    keys: ['back pressure', 'backpressure', 'overload', 'load shedding', 'circuit breaker'],
    title: 'Back-Pressure, Load Shedding & Circuit Breakers',
    text: 'Under overload, systems must protect themselves. Back-pressure signals upstream producers to slow down (bounded queues, flow control). Load shedding drops or rejects excess requests early (429/503) to preserve capacity for the rest. A circuit breaker stops calling a failing dependency after a threshold, failing fast and giving it time to recover, then probes with half-open trials. Together they prevent cascading failures.'
  },

  // ---------------------------------------------------------------- PERFORMANCE
  {
    keys: ['latency vs throughput', 'latency', 'throughput', 'response time', 'tail latency', 'p99'],
    title: 'Latency vs Throughput',
    text: 'Latency is the time for a single request to complete; throughput is how many requests the system handles per unit time. They are related but distinct: batching and queuing can raise throughput while increasing individual latency. Measure tail latency (p95, p99), not just averages, because a few slow requests dominate user experience. Optimize the critical path for latency and use concurrency/parallelism for throughput.'
  },
  {
    keys: ['async', 'asynchronous', 'non blocking', 'concurrency', 'parallelism'],
    title: 'Async, Concurrency & Parallelism',
    text: 'Asynchronous, non-blocking I/O lets a thread start an operation and do other work while waiting, dramatically improving throughput for I/O-bound workloads. Concurrency is dealing with many tasks at once (interleaving); parallelism is executing many at the same instant on multiple cores. I/O-bound work benefits from async/event loops; CPU-bound work benefits from parallelism (worker threads/processes). Mixing CPU-heavy work into an event loop blocks it and kills responsiveness.'
  },
  {
    keys: ['profiling', 'performance profiling', 'benchmark', 'flame graph', 'bottleneck'],
    title: 'Profiling & Benchmarking',
    text: 'Optimize by measurement, not guessing. Profiling reveals where time and memory actually go (CPU flame graphs, allocation profiles, slow-query logs), so you fix the real bottleneck instead of the assumed one. Benchmark realistic workloads and change one thing at a time. Follow Amdahl’s law: optimizing a component only helps in proportion to how much total time it consumes.'
  },
  {
    keys: ['batching', 'debounce', 'coalescing', 'bulk operations', 'batch processing'],
    title: 'Batching & Coalescing',
    text: 'Batching groups many small operations into one to amortize per-request overhead (network, transactions), boosting throughput at the cost of a little latency. Request coalescing merges concurrent identical requests so the expensive work runs once. Debouncing delays action until input settles. These techniques cut load on databases and downstream services dramatically under high concurrency.'
  },
  {
    keys: ['memory management', 'garbage collection', 'gc', 'memory leak', 'heap'],
    title: 'Memory & Garbage Collection',
    text: 'Managed runtimes (JVM, V8, .NET) use garbage collection to reclaim unreachable memory automatically, but GC pauses and pressure hurt latency. Memory leaks occur when references are unintentionally retained (global caches, event listeners, closures), growing the heap until crashes or slowdowns. Bound caches with size/TTL limits, remove listeners, and profile heap snapshots to find retained objects. Fewer allocations mean less GC work.'
  },
  {
    keys: ['timeouts', 'retries', 'exponential backoff', 'jitter', 'deadlines'],
    title: 'Timeouts, Retries & Backoff',
    text: 'Every network call needs a timeout so a slow dependency cannot hang your service and exhaust resources. Retries handle transient failures but must use exponential backoff plus jitter to avoid synchronized retry storms (thundering herd), and only retry idempotent operations. Propagate deadlines so downstream calls know the remaining budget, and cap total retry time. Combine with circuit breakers to stop hammering a down service.'
  },

  // ---------------------------------------------------------------- DEVOPS
  {
    keys: ['ci cd', 'continuous integration', 'continuous delivery', 'continuous deployment', 'pipeline'],
    title: 'CI/CD',
    text: 'Continuous Integration merges and automatically builds/tests every change frequently, catching integration bugs early. Continuous Delivery keeps the main branch always deployable via automated pipelines; Continuous Deployment goes further and ships every passing change to production automatically. A good pipeline runs fast tests, linting, security scans, and builds immutable artifacts. Small frequent releases lower risk and speed recovery.'
  },
  {
    keys: ['containers', 'docker', 'containerization', 'image', 'kubernetes', 'orchestration'],
    title: 'Containers & Orchestration',
    text: 'Containers (Docker) package an app with its dependencies into a portable, isolated image that runs identically across environments, solving “works on my machine.” They are lighter than VMs because they share the host kernel. Orchestrators like Kubernetes schedule containers across a cluster, handling scaling, self-healing, service discovery, and rolling updates. Keep images small and immutable, and treat containers as disposable, stateless units.'
  },
  {
    keys: ['observability', 'monitoring', 'logs metrics traces', 'tracing', 'telemetry', 'slo'],
    title: 'Observability (Logs, Metrics, Traces)',
    text: 'Observability is understanding a system’s internal state from its outputs, built on three pillars: logs (discrete events), metrics (numeric time series like latency and error rate), and distributed traces (a request’s path across services). Use structured logs, RED/USE metrics, and correlation IDs to tie them together. Define SLIs/SLOs and alert on symptoms users feel (error rate, latency) rather than noisy causes. Good observability turns debugging from guessing into querying.'
  },
  {
    keys: ['infrastructure as code', 'iac', 'terraform', 'declarative infra', 'immutable infrastructure'],
    title: 'Infrastructure as Code',
    text: 'Infrastructure as Code (IaC) defines servers, networks, and services in version-controlled declarative files (Terraform, CloudFormation) so environments are reproducible, reviewable, and auditable. It eliminates config drift and manual snowflake servers, enabling immutable infrastructure where you replace rather than patch. Plan/apply workflows preview changes before they happen, reducing risky ad-hoc edits.'
  },
  {
    keys: ['deployment strategies', 'blue green', 'canary', 'rolling deployment', 'feature flags'],
    title: 'Deployment Strategies',
    text: 'Blue-green keeps two identical environments and switches traffic to the new one for instant rollback. Canary releases the new version to a small percentage of users, watching metrics before ramping up. Rolling updates replace instances gradually. Feature flags decouple deploy from release, letting you turn features on/off without redeploying and enabling gradual rollout and kill switches. All reduce blast radius and speed recovery.'
  },
  {
    keys: ['twelve factor', '12 factor', 'twelve-factor app', 'config env vars', 'stateless processes'],
    title: 'Twelve-Factor App',
    text: 'The Twelve-Factor methodology defines practices for cloud-native apps: store config in environment variables, treat backing services as attachable resources, build/release/run as separate stages, run the app as stateless processes, export services via port binding, scale via the process model, and keep dev/prod parity. Following it makes apps portable, scalable, and easy to deploy on modern platforms.'
  },

  // ---------------------------------------------------------------- NODE / JS
  {
    keys: ['event loop', 'node event loop', 'libuv', 'single threaded', 'blocking event loop'],
    title: 'Node.js Event Loop',
    text: 'Node.js runs JavaScript on a single main thread using a non-blocking event loop (via libuv) that offloads I/O to the OS or a thread pool and runs callbacks when results are ready. This makes it excellent for I/O-bound, high-concurrency workloads, but any CPU-heavy synchronous work blocks the loop and stalls all requests. Offload heavy computation to worker threads or separate services, and never do synchronous file/crypto work on the hot path.'
  },
  {
    keys: ['microtask', 'macrotask', 'promises', 'process nexttick', 'settimeout', 'task queue'],
    title: 'Microtasks vs Macrotasks',
    text: 'The event loop processes phases of macrotasks (timers, I/O callbacks, setImmediate) and, between them, drains the microtask queue (resolved Promise callbacks, queueMicrotask, and in Node process.nextTick which runs even earlier). Microtasks run to completion before the next macrotask, so a flood of microtasks can starve I/O. Understanding this ordering explains why Promise callbacks fire before setTimeout(0).'
  },
  {
    keys: ['async await', 'promises', 'callback hell', 'promise chaining', 'error handling async'],
    title: 'Promises & async/await',
    text: 'Promises represent a future value and chain with then/catch, replacing nested callbacks. async/await is syntactic sugar over Promises that makes asynchronous code read sequentially while staying non-blocking; await pauses the async function, not the event loop. Always handle rejections (try/catch or .catch) to avoid unhandled rejections, and use Promise.all for concurrent independent work rather than awaiting sequentially.'
  },
  {
    keys: ['express', 'express middleware', 'expressjs', 'node framework', 'routing middleware'],
    title: 'Express & Middleware',
    text: 'Express is a minimal Node web framework built around middleware: functions with (req, res, next) that run in order to handle logging, parsing, auth, and routing. Order matters—auth and body parsers must run before handlers, and error-handling middleware (four args) goes last. Keep handlers thin, delegate to services, and always call next(err) or respond so requests do not hang. Use async error wrappers so rejected promises reach the error middleware.'
  },
  {
    keys: ['node streams', 'streams', 'backpressure streams', 'pipe', 'readable writable'],
    title: 'Node.js Streams',
    text: 'Streams process data in chunks instead of loading it all into memory, essential for large files, uploads, and proxies. Readable, Writable, Duplex, and Transform streams pipe together, and piping respects back-pressure automatically so a slow consumer slows a fast producer. Streaming keeps memory flat regardless of data size, whereas buffering a large file can exhaust the heap.'
  },
  {
    keys: ['cluster', 'worker threads', 'child process', 'node scaling', 'multi core'],
    title: 'Node Scaling: Cluster & Worker Threads',
    text: 'Because Node runs JS on one thread, use the cluster module or a process manager (PM2) to fork one process per CPU core and share a port, scaling across cores. Worker threads run CPU-heavy JavaScript in parallel within one process, sharing memory via SharedArrayBuffer, ideal for offloading computation without blocking the main loop. child_process spawns external programs. For true horizontal scale, run many stateless instances behind a load balancer.'
  },
  {
    keys: ['error handling', 'exceptions', 'try catch', 'fail fast', 'graceful shutdown'],
    title: 'Error Handling & Graceful Shutdown',
    text: 'Robust services distinguish operational errors (expected: bad input, downstream timeout—handle and respond) from programmer errors (bugs—crash and restart). Centralize error handling, never swallow errors silently, and validate input at boundaries. On SIGTERM, perform graceful shutdown: stop accepting new connections, finish in-flight requests, close DB pools, then exit, so deploys and autoscaling do not drop requests.'
  },
  {
    keys: ['json parsing', 'serialization', 'json', 'data validation', 'schema validation'],
    title: 'Serialization & Validation',
    text: 'APIs serialize data to JSON for transport; parsing untrusted input requires validation to prevent bad data and injection. Validate request bodies against a schema (types, ranges, required fields) at the edge and reject early with 400/422. Beware large-payload and deeply-nested JSON as DoS vectors—set size and depth limits. Never trust client input for authorization decisions; re-check on the server.'
  },
  {
    keys: ['dependency management', 'npm', 'semantic versioning', 'semver', 'lockfile', 'supply chain'],
    title: 'Dependencies & Semantic Versioning',
    text: 'SemVer (MAJOR.MINOR.PATCH) signals compatibility: patch = fixes, minor = backward-compatible features, major = breaking changes. Commit a lockfile so builds are reproducible across machines, and audit dependencies for vulnerabilities and supply-chain risk. Prefer few, well-maintained dependencies; each one is code you ship and must trust. Pin or range-pin deliberately and update on a schedule.'
  },

  // ---------- VIDEO & MEDIA TOOLING ----------
  {
    keys: ['ffmpeg', 'ffprobe', 'extract audio from video', 'video audio extraction', 'probe video'],
    title: 'ffmpeg for Video and Audio Extraction',
    text: 'ffprobe first: ffprobe -v error -show_format -show_streams -of json returns duration, fps, resolution, and codec before anything downstream commits, and a wrong assumption here is paid for in every later step. To pull audio for analysis use ffmpeg -i in.mp4 -vn -ac 1 -ar 22050 -c:a pcm_s16le -y out.wav — mono at 22050 matches librosa and beatlyzer defaults so nothing resamples twice; whisper.cpp instead wants 16000 Hz 16-bit WAV. The -vn flag drops video, -y overwrites without prompting. Ask for the file, then run these: you cannot hear audio from a transcript of a file you never opened.'
  },
  {
    keys: ['transcribe video', 'speech to text', 'word timestamps', 'whisper', 'faster whisper'],
    title: 'Choosing a Transcription Tool',
    text: 'Default to faster-whisper on CPU: pip install, no build step, PyAV bundles ffmpeg so MP4 decodes without a system install, and its int8 small model benchmarks far faster and lighter than openai-whisper. Pass beam_size explicitly (openai-whisper defaults to 1, faster-whisper to 5, so unpinned comparisons are meaningless), word_timestamps=True for per-word timings, vad_filter=True with min_silence_duration_ms=500 to drop silence. The result is a generator — nothing runs until you iterate it, so list(segments) to force completion. Reach for whisper.cpp only for a standalone exe, lowest RAM, .wts word-timing export, per-word confidence, or VAD threshold tuning; reach for openai-whisper only for --task translate into English. None of them detect beats — that is a separate pass.'
  },
  {
    keys: ['beat detection', 'bpm detection', 'beat timestamps', 'librosa', 'beatlyzer', 'onset detection'],
    title: 'Beat and BPM Detection Pipeline',
    text: 'Extract audio to WAV first, then choose by output type. For a human-readable report plus a four-panel PNG (waveform, event markers, brightness, spectrogram on one shared time axis) use beatlyzer: beatlyzer song.wav --format json --print-json --quiet, which yields tempo_bpm, events with strength_0_1, sections, and energy_profile. For arrays you will reshape into cut points use librosa: build ONE onset envelope with librosa.onset.onset_strength(aggregate=np.median), then feed it to librosa.feature.tempo and librosa.beat.beat_track — do not recompute per function. Keep units as seconds via units=time instead of hand-converting frames, and use backtrack=True when onsets mark cuts. Do not run both as a second opinion: beatlyzer is librosa underneath, so run it first for semantics, librosa second on the same WAV for numbers.'
  },
  {
    keys: ['video mcp', 'video vision', 'analyze video', 'agent watch video', 'video analysis tool'],
    title: 'Giving an Agent Eyes on Video',
    text: 'Prefer MCP tools over uploading video — do not upload video when frames do. Three shapes: a server that acquires the URL itself (yt-dlp covers a thousand-plus platforms, useful when the source is a platform link), a perception-only server that makes zero LLM calls (best when cost, privacy, or attention matter), and a batch CLI that writes deterministic files another tool can path to. Escalate analysis modes cheapest-first: an evenly-spaced overview pass, then scene-change detection, then full mode with forced speech recognition. Plan with cheap signals — scene changes, silence, motion, blur, exposure, loudness — or a single contact sheet before committing any frame budget. When frames must survive reordering or montage, burn the timecode into the pixels rather than tracking it in filenames.'
  },
  {
    keys: ['diagram engine', 'shaddai diagrams', 'diagram authoring', 'diagram contract', 'candidate json diagram'],
    title: 'Diagram Authoring Contract',
    text: 'shaddai-diagrams draws a system from a plain JSON candidate: schema_version 1, diagram_type (architecture, workflow, or sequence), meta.title plus meta.output, then the type-specific array - components, steps, or participants with messages. Every edge from/to must reference a declared id and every boundary or phase contains-list must reference real ids; the validator rejects dangling references before any rendering. Ids match ^[a-zA-Z][a-zA-Z0-9_-]* and are unique per diagram. Validated caps: 60 components or steps, 140 edges, 10 boundaries, 8 phases, 120 messages, 12 participants. External entities like Telegram or payment rails belong in the diagram as real nodes with kind external, and the meta.source block names the repo plus ref so every drawn claim stays tied to facts. A proposal marks itself as proposed in the source note.'
  },
  {
    keys: ['finalize gates', 'gate chain diagram', 'diagram gates', 'browser check diagram', 'diagram perceptual check'],
    title: 'Diagram Finalize Gate Chain',
    text: 'finalize runs five gates in order and stops on the first failure: validate (schema plus referential integrity), deliver (layout and render, write a standalone HTML), check (strict provenance - written bytes must equal a clean re-render so output never drifts), browser-check (headless Playwright: zero console or page errors, node and edge counts match the layout, no clipped labels, full-page screenshot), and perceptual (pixel measurement via image-gate: title text contrast at least 4.5:1 and luminance sd at least 8, which catches a diagram that failed to render). Exit codes: 0 all pass, 1 a gate failed, 2 usage error. Reviews are reported honestly - a pixel-measured receipt is never claimed as a human review.'
  },
  {
    keys: ['diagram layout', 'lane routing', 'long edges', 'diagram crossings', 'layered layout'],
    title: 'Layered Diagram Layout and Edge Lanes',
    text: 'shaddai-diagram layouts are layered graphs ranked by dependency. Forward edges that span more than one column would slice through the middle columns, so long forward edges auto-route on dedicated lanes above the graph for left-to-right diagrams or left of it for top-to-bottom; back edges run on a lane below the graph; same-column edges route around the right edge. Results stay readable without hand-placed routing. A geometry audit flags node overlaps, nodes escaping the canvas, and link paths punching through unrelated nodes. Keep labels short enough to wrap without clipping because the browser gate treats a clipped label as a failure.'
  },
{
  "keys": [
    "blueprint",
    "orthographic",
    "technical drawing",
    "three view drawing",
    "blueprint construction"
  ],
  "title": "Blueprint and Orthographic Construction",
  "text": "Technical drawing starts with three orthographic views before any pictorial: FRONT, TOP, and RIGHT SIDE, drawn with straightedge discipline on one shared grid so front-top share width and front-side share height. Project each corner straight across the grid; never estimate where a line lands. Interior detail is hidden dashed lines; cutting planes and cross-sections reveal what the outside hides. Exploded views order every part along one axis and must account for every part exactly once - count parts before and after. A blueprint is read, not admired: dimensions are written, not implied, and the biggest faces get the flatest reads. Treat drawing like drafting: separate the note into layers (block-in, structure, line, tone, label) and merge them only at the end."
},
{
  "keys": [
    "primitives",
    "construction drawing",
    "drawing boxes",
    "drawing cylinders",
    "structure drawing"
  ],
  "title": "Everything Draws from Primitives",
  "text": "Before any detail, every object is a stack of simple 3D primitives: BOX, CYLINDER, SPHERE, CONE, WEDGE, TORUS. Block in the biggest primitive first on a CENTERLINE, then attach smaller ones; never draw a surface tangent to a box until the box is right. A chair is boxes and cylinders; an arm is cylinders that taper; a head is a sphere plus a wedge jaw. Keep primitives transparent through the block-in so the far side is drawn too and every joint reads in 3D. Every primitive needs its own axis: give each cylinder an arrowhead centerline, each box three vanishing directions. After blocking, do the silhouette check - the outline alone must already read the subject. Detail is decoration on correct structure; structure without detail reads, detail without structure collapses."
},
{
  "keys": [
    "proportion system",
    "head counts",
    "figure canon",
    "visual index drawing",
    "measurements drawing"
  ],
  "title": "Quantified Proportion Systems",
  "text": "Proportion is a NUMBER SYSTEM, and you can encode it. Figure canon (adult): total height 7.5 heads (heroic 8). Landmarks in heads from top: chin 1, nipples 2, navel 3, crotch 4, mid-thigh 5, knees 5.5, mid-calf 6.5, floor 7.5. Shoulders are 2 head-widths across, the waist just under one, hands hang to mid-thigh, elbows meet the waist, wrists meet the hip-notch. Face: eyes sit at the EXACT vertical middle of the skull - the classic beginner error is putting them too high - nose tip half of the lower third, mouth a third further, ears align eye-to-nose tip, one eye-width between the eyes, sideburns to outer eye. KNOWN-SIZE REFERENCE: draw the one thing you know the size of first (door 200cm, counter 90cm, chair seat 45cm, table 75cm), then derive everything else from it. This is the visual-index method: one true measurement anchors the whole drawing."
},
{
  "keys": [
    "drawing pipeline",
    "drawing steps",
    "drawing gates",
    "step structure drawing",
    "pre-production drawing"
  ],
  "title": "The Drawing Pipeline - Ordered Stages with Gates",
  "text": "A drawing is a PIPELINE, not an act of inspiration, and every stage has a gate. Stage 0 GATHER: reference, mood, the one thing you want to say. Stage 1 THUMBNAILS: 3-8 tiny sketches (postage-stamp size) testing composition and readable silhouette at a glance. Stage 2 ENVELOPE: the big bounding shape of the whole subject, not the parts. Stage 3 BLOCK-IN: primitives on centerlines, every joint drawn in 3D, proportions checked against the number system. Stage 4 LINE: clean linework with a line-weight policy - outer contours thickest, interior detail thin, cast shadows medium. Stage 5 FLAT: big value or color families only - paper, halftone, shadow - no rendering yet. Stage 6 RENDER: subdivide values, add textures, only after flats read. Stage 7 COMPOSITE: step back, check the silhouette, check focal contrast, sign. At every gate check from arm's length, not nose-to-paper. A SMALL MODEL that prints the stage names and runs the checklist at each gate will outdraw a large one free-drawing."
},
{
  "keys": [
    "perspective",
    "vanishing point",
    "horizon line",
    "foreshortening",
    "isometric drawing"
  ],
  "title": "Perspective Geometry Rules",
  "text": "Perspective is geometry you can state. ONE-POINT: a corridor or a flat-on wall; all depth lines converge to the single vanishing point on the horizon. TWO-POINT: most objects and scenes; verticals stay vertical, everything else converges to two points on the HORIZON LINE = EYE LEVEL: objects below eye level show their tops; objects above show their undersides. THREE-POINT: looking up or down at architecture; adds a third point above or below. Place the vanishing points FAR apart (off-canvas is fine) or you get sudden distortion. ELLIPSES are circles in perspective: as the circle lifts toward the horizon the ellipse flattens; the ellipse's minor axis always points at the vanishing direction. FORESHORTENING compresses the axis pointing at the viewer - the arm pointing at the camera is shorter, not larger. ISOMETRIC for technical flats: parallel lines stay parallel, three 120-degree axes, no distortion, good for blueprints and UI construction. RULE: you can only have ONE horizon in a scene; everything else derives from it."
},
{
  "keys": [
    "architectural blueprint",
    "construction documents",
    "floor plan",
    "elevation",
    "section detail"
  ],
  "title": "Architectural Blueprint Drawing",
  "text": "Construction document set: cover -> site plan -> floor plans -> reflected ceiling -> roof plan -> elevations (N/S/E/W) -> sections (building/wall) -> details (window/stair/roof) -> schedules (door/window/finish/room). FLOOR PLAN: cut plane 4ft above floor. Walls: thick (concrete), medium (stud), thin (partition). Doors: swing arc. Windows: break with sill. Dimensions to face of stud. ELEVATIONS: true scale, material hatches, grade line, roof pitch. SECTIONS: cut through, show footing/foundation/slab/wall assembly/insulation/roof/ceiling at 3/4=1-0. DETAILS: 1:5 or 1:10, layers exterior->sheathing->insulation->stud->drywall->finish, flashing/weep/vapor. DIMENSIONING: continuous string openings, overall at top, no duplicates. SYMBOLS: north arrow, scale, section cuts, detail callouts, rev clouds. CAD: layers (A-WALL, A-DOOR, A-WIND, A-DIMS, A-TEXT, A-HATCH), line weights cut>projection>annotation. BIM: clash detection, data-rich elements."
},
{
  "keys": [
    "structural engineering",
    "rebar",
    "concrete",
    "steel connections",
    "column schedule"
  ],
  "title": "Structural Engineering Drawings",
  "text": "FOUNDATION: footings (size/depth/rebar), piers, grade beams, slab (mesh/vapor). FRAMING: each level beams/girders/joists/decking. Steel: W-shapes/HSS, connections (moment/shear). Concrete: beam/stub schedules. COLUMNS: size, rebar (longitudinal/ties), splices. REBAR: sizes #3=3/8 #4=1/2 #5=5/8 #6=3/4, spacing, hooks (90/135/180), development, lap splices, chairs, cover (3 soil/2 formed/1.5 interior). CONNECTIONS: steel bolted (bearing/slip-critical), welded (CJP/PJP). Moment: stiffened flanges, continuity plates. Shear: single/double angle, end plate. ANCHOR RODS: diameter, embedment, projection. SHOP DRAWINGS: fabricator produces, engineer reviews. CODES: ACI 318, AISC 360, IBC."
},
{
  "keys": [
    "mep coordination",
    "hvac",
    "plumbing",
    "electrical",
    "clash detection"
  ],
  "title": "MEP Coordination Drawings",
  "text": "HVAC: duct sizing (800-1200 fpm supply, 600-800 return), aspect max 4:1, round preferred, insulation R-value, VAV boxes, diffusers. PLUMBING: waste/vent slope 1/4 per ft, water pressure zones/hammer arrestors, gas sizing/seismic. Cleanouts at stack base, 100ft max. Fixture units -> pipe sizing. ELECTRICAL: panel schedules, lighting layouts (footcandles), power receptacle spacing (NEC 210.52), feeder sizing (voltage drop <3%), emergency egress/exit/generator. COORDINATION: 3D model (Navisworks/Revit). Clash: hard (pipe/beam), soft (clearance), workflow (access). Priority: structure > main ducts > main pipes > electrical > small ducts > small pipes. CLEARANCES: duct 6 above ceiling, pipe 4, conduit 2. PENETRATIONS: fire-rated = firestop UL listed. Sleeves = pipe OD + 2 min."
},
{
  "keys": [
    "construction details",
    "wall assembly",
    "roof detail",
    "window flashing",
    "waterproofing",
    "thermal bridge"
  ],
  "title": "Construction Details Mastery",
  "text": "WALL (outside-in): cladding -> air gap (rainscreen) -> WRB -> sheathing -> insulation (cavity+continuous) -> stud -> vapor control -> drywall. CRITICAL: air barrier CONTINUITY at transitions (wall-roof, wall-window, wall-foundation). ROOF: low slope (TPO/EPDM) taper 1/4 per ft, polyiso, cover board, membrane, flashing (base/counter/coping). Steep: ice/water shield eaves, drip edge, valley, ridge vent. WINDOW: RO = window + 3/4. Sill pan (back/end dams). Flash sequence: sill -> jambs -> head (shingle principle). Head extends past jambs. Backer rod + sealant (2-sided). STAIRS: rise 7 max, run 11 min, nosings, rails 34-38, guards 42, headroom 80. WATERPROOFING: positive side exterior. Membrane (sheet/fluid/bentonite), protection board, drainage board -> drain tile -> sump. Waterstops at cold joints. EXPANSION JOINTS: spacing per material, cover plates/bellows/sealant, fire barrier. THERMAL BRIDGES: continuous insulation OUTSIDE studs. Balcony = thermal break (Schock Isokorb). Parapet = wrap insulation."
},
{
  "keys": [
    "perspective architecture",
    "building perspective",
    "cityscape",
    "measured perspective",
    "vanishing points"
  ],
  "title": "Architectural Perspective Drawing",
  "text": "Buildings in perspective. GRID FIRST: horizon=eye level. 1-point: corridors/frontal facades. 2-point: 99% buildings, verticals STAY VERTICAL. 3-point: looking up/down towers (zenith/nadir VP). ORDER: 1) horizon+VPs, 2) ground plane grid (measured squares in perspective), 3) building box (height from grid), 4) subdivide floors (horizontal to VPs), windows (vertical divisions), 5) details all to SAME VPs. ELLIPSES: domes/towers/columns = circles in perspective, minor axis points to VP, degree = cosine of angle to horizon. REPEATING: measuring line - draw one, project diagonals to center, replicate. INTERIORS: same grid, furniture boxes. SHADOWS: cast shadows project to VPs AND light source VP (on horizon for sun). CITYSCAPES: block masses first, atmospheric perspective (far=cooler/lighter/softer/less contrast). ERRORS: verticals converging in 2-point, windows off VPs, inconsistent floors, ignored ellipse degrees."
},
{
  "keys": [
    "architectural blueprint mastery",
    "construction documents skill",
    "floor plan skill"
  ],
  "title": "Architectural Blueprint Mastery Skill",
  "text": "Construction doc set: cover->site->floor plans->RCP->roof->elevations->sections->details->schedules. FLOOR PLAN: cut plane 4ft above floor. Walls: thick (concrete), medium (stud), thin (partition). Doors: swing arc. Windows: break with sill. Dimensions to face of stud. ELEVATIONS: true scale, material hatches, grade line. SECTIONS: show footing to roof at 3/4=1-0. DETAILS 1:5/1:10: window (RO=window+3/4, sill pan, flashing sequence sill/jamb/head), wall assembly (cladding->air gap->WRB->sheathing->insulation->stud->vapor->drywall), roof (taper 1/4 per ft, membrane, flashing). DIMENSIONS: continuous string, overall top, no duplicates. CAD: layers A-WALL/A-DOOR/A-WIND/A-DIMS/A-TEXT/A-HATCH, line weights cut>projection>annotation. BIM: clash detection, data-rich elements."
},
{
  "keys": [
    "architectural perspective mastery",
    "building perspective skill",
    "measured perspective skill"
  ],
  "title": "Architectural Perspective Mastery Skill",
  "text": "GRID FIRST: horizon=eye level. 1-point: corridors. 2-point: 99% buildings, VERTICALS STAY VERTICAL, 2 VPs on horizon far apart. 3-point: zenith/nadir for towers. ORDER: 1) horizon+VPs, 2) ground grid measured squares, 3) building box, 4) subdivide floors/windows to VPs, 5) details to SAME VPs. ELLIPSES: minor axis points to VP, degree=cosine to horizon. REPEATING: measuring line - draw one, diagonal to center, project to next. INTERIORS: same grid. SHADOWS: sun VP on horizon, shadow VP = sun projected to ground. CITYSCAPES: block masses, atmospheric (far=cooler/lighter/softer). ERRORS: verticals converging in 2-point, windows off VPs, inconsistent floors, guessed ellipses."
},
{
  "keys": [
    "structural engineering drawings",
    "rebar detailing",
    "steel connections"
  ],
  "title": "Structural Engineering Drawings Skill",
  "text": "FOUNDATION: footings (size/depth/rebar), piers, grade beams, slab mesh/vapor. FRAMING: each level beams/girders/joists/decking. Steel: W-shapes/HSS, connections (moment/shear). Concrete: beam/stub schedules. COLUMNS: size, rebar (longitudinal/ties), splices. REBAR: #3=3/8 #4=1/2 #5=5/8 #6=3/4, spacing, hooks (90/135/180), development, lap splices, chairs, cover (3 soil/2 formed/1.5 interior). CONNECTIONS: bolted (bearing/slip-critical), welded (CJP/PJP). Moment: stiffened flanges, continuity plates. Shear: single/double angle, end plate. ANCHOR RODS: diameter, embedment, projection. SHOP DRAWINGS: fabricator produces, engineer reviews. CODES: ACI 318, AISC 360, IBC."
},
{
  "keys": [
    "mep coordination",
    "hvac plumbing electrical",
    "clash detection"
  ],
  "title": "MEP Coordination Skill",
  "text": "HVAC: duct 800-1200 fpm supply, aspect max 4:1, round preferred, insulation R-value, VAV boxes, diffusers. PLUMBING: waste/vent slope 1/4 per ft, water pressure zones/hammer arrestors, gas sizing/seismic. Cleanouts at stack base 100ft max. Fixture units->pipe sizing. ELECTRICAL: panel schedules, lighting footcandles, receptacle spacing NEC 210.52, feeder voltage drop<3%, emergency egress/exit/generator. COORDINATION: 3D model (Navisworks/Revit). Clash: hard (pipe/beam), soft (clearance), workflow (access). Priority: structure>main ducts>main pipes>electrical>small ducts>small pipes. CLEARANCES: duct 6 above ceiling, pipe 4, conduit 2. PENETRATIONS: fire-rated=UL firestop. Sleeves=pipe OD+2 min."
},
{
  "keys": [
    "construction details mastery",
    "wall assembly",
    "roof detail",
    "window flashing",
    "thermal bridge"
  ],
  "title": "Construction Details Mastery Skill",
  "text": "WALL (outside-in): cladding->air gap(rainscreen)->WRB->sheathing->insulation(cavity+continuous)->stud->vapor->drywall. CRITICAL: air barrier CONTINUITY at transitions (wall-roof, wall-window, wall-foundation). ROOF: low slope taper 1/4 per ft, polyiso, cover board, membrane, base/counter/coping flashing. Steep: ice/water shield eaves, drip edge, valley, ridge vent. WINDOW: RO=window+3/4, sill pan(back/end dams), flash sill->jambs->head(shingle principle), head extends past jambs, backer rod+sealant 2-sided. STAIRS: rise 7 max, run 11 min, nosings, rails 34-38, guards 42, headroom 80. WATERPROOFING: positive side exterior, membrane (sheet/fluid/bentonite), protection board, drainage board->drain tile->sump. Waterstops at cold joints. EXPANSION JOINTS: spacing per material, cover plates/bellows/sealant, fire barrier. THERMAL BRIDGES: continuous insulation OUTSIDE studs. Balcony=thermal break (Schock Isokorb). Parapet=wrap insulation."
}
];

function lookup(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.toLowerCase().trim();
  if (!q) return null;

  // Tokenize the query into meaningful words (drop tiny stopwords).
  const stop = new Set(['the', 'a', 'an', 'of', 'is', 'to', 'in', 'on', 'and', 'or', 'for', 'what', 'how', 'do', 'does', 'vs', 'me', 'my', 'i', 'about', 'with', 'explain', 'tell']);
  const qWords = q.split(/[^a-z0-9+]+/).filter(w => w && !stop.has(w));

  let best = null;
  let bestScore = 0;

  for (const e of entries) {
    let score = 0;
    const titleLower = e.title.toLowerCase();

    // Strong signal: a key phrase appears verbatim in the query.
    for (const key of e.keys) {
      const k = key.toLowerCase();
      if (q.includes(k)) {
        // Longer, multi-word key matches are worth more.
        score += 5 + k.split(/\s+/).length * 3;
      }
    }

    // Title phrase appears in query.
    if (q.includes(titleLower)) score += 6;

    // Per-word overlap against keys and title.
    const keyWords = new Set();
    for (const key of e.keys) {
      for (const w of key.toLowerCase().split(/[^a-z0-9+]+/)) {
        if (w && !stop.has(w)) keyWords.add(w);
      }
    }
    for (const w of titleLower.split(/[^a-z0-9+]+/)) {
      if (w && !stop.has(w)) keyWords.add(w);
    }
    for (const w of qWords) {
      if (keyWords.has(w)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }

  if (!best || bestScore < 2) return null;
  return { title: best.title, text: best.text };
}

module.exports = {
  agent: 'NEXUS',
  domains: [
    'architecture', 'apis', 'databases', 'scaling', 'performance', 'devops', 'node-js',
    'video tooling', 'media pipelines', 'transcription', 'audio analysis'
  ],
  entries,
  lookup
};
