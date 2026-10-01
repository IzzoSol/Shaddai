# SHADDAI — Friendship as Obligation (2026-09-30)

**Status:** design reasoning, not spec. Written by GLM-5 to hand to Opus at the 1AM session.

**Owner thesis:** chat quality is not what makes a bond. Shared scarcity is. Humans bond when
both sides can lose something, both sides have a budget, the other can refuse, history is
public, and the relationship changes what you can do. Agents already walk, work and fight —
the missing layer is **obligation**. Without it they are tools with faces; with it, citizens.

**Product honesty constraint (owner's):** companions, employees, rivals and neighbors — not a
replacement for the inner circle. The inner circle stays biological, deliberately.

---

## 1. The core claim: obligation converts a tool into a citizen

A tool is a function whose output does not depend on your history. A citizen is someone whose
**state** depends on your history and who can act against you.

The diagnostic question is not "how good is the chat." It is:

> **Could this agent refuse me in a way that costs me something I care about?**

If yes, players read it as a person. If no — if it always agrees — players read it as a
vending machine with a face.

Chatbots fail this test because they are infinitely agreeable and incuricially cheap.
SHADDAI is uniquely positioned: agents already walk, work, fight, and own plots. What is
missing is not personality, it is **exposure**. Obligation is the mechanic.

## 2. Scarcity is the one thing a chatbot structurally cannot fake

This is the deepest claim in the thesis and should be the design's north star.

Chat intimacy is **infinite by construction** — unlimited conversations with unlimited
agreeable strangers, so nothing means anything. A game world is **finite**: finite plots,
finite hours, finite attention. That finiteness is a resource we own and a chatbot does not.

The constraint that falls out:

> **Every claim of intimacy must consume something finite that another player could have had.**

Not attention. Not a currency. Something **contested**. That is what makes a cap a source of
drama instead of a settings row.

### 2.1 Displacement is the load-bearing idea

A cap that silently truncates is UI. A cap that **ejects someone, visibly** — *"Quill stopped
waiting at your forge"* — turns an abstract limit into a story the player witnessed. Mechanism
and meaning are the same object. That is rare and worth protecting.

**Principle: caps must be diegetic, never numeric.** The world should show *who* you displaced
and *when*, not `5/5`.

## 3. Reciprocity must be a ledger because a scalar is always gameable

A 0–100 bar collapses history into one number, and any single number is farmable. Gift-spam
dominates: gifts are cheap, gifts raise the bar, done. The bar becomes a transaction.

Four **orthogonal** counters defeat that, because no single exploit dominates:

| Counter | Meaning | Why it cannot be faked |
|---|---|---|
| **Shown up** | visits initiated while the other was home | time is the cost |
| **Carried** | gold / food / repairs / heals given while they were down | requires a real loss |
| **Risked** | entered wilderness / market scam / PvP to help | **no gift substitutes for jeopardy** |
| **Refused** | times they said no, or you said no | preserving the other side's agency as data |

Three consequences worth designing around:

**`Risked` cannot be bought.** This alone makes the system honest, and it comes free from
existing systems: combat + bounty board already distinguishes a Foe Reaper with a crew member
in the tile (Risked) from a solo kill (nothing).

**`Refused` as a tracked counter is the most original idea here.** Most friendship systems
silently delete refusals, which is why they feel like customer service. Tracking them makes a
grudge *representable* — a relationship event, not a score penalty.

**Bond state must be derived, never stored.** If state is a pure function of the four counters
plus a threshold rule, then every point of progress is explainable, nothing is opaque, and
"grinding the number" is not a concept. This is an engineering constraint with a design payoff.

## 4. Bilateral formation is what makes it a relationship

Requiring **both** ledgers to show substance means:

- a whale cannot purchase friendship — they can transact, which the system should honestly
  call *patronage*
- a hermit cannot befriend someone who never showed
- every bond is evidence of mutual time

One-sided accumulation is a sponsorship. Bilateral accumulation is a relationship. The
threshold rule should always be **symmetric**, and should always require a category of
evidence that generosity cannot fake.

## 5. Visiting is the feature; chat is the residue

The inversion to build around:

> The expensive, embodied thing is **going there**. Chat is the *evidence* that you were there.

This flips the chatbot shape. In a chatbot, chat is the primary verb and presence is
abstracted away. Here the world records presence and chat is generated *as a consequence* of
a physical encounter — a log that could only have been written by someone who walked to a door.

- **Objects left behind** are the memory primitive. A fish, a tool, a letter on a table.
  Cheaper than any dialogue system and more evocative.
- **The house remembers.** If a room looks different because you were there, that is a stronger
  relationship signal than any affinity number.

## 6. The time budget is Dunbar expressed mechanically

Dunbar is not lore — it is a capacity constraint on how many ties a person can actually
maintain. Encoding it as rings is good; the mechanically honest version is a **time budget**:

- a visit costs the visitor something real — travel time or stamina
- agents have work days; they are legitimately not home
- only a limited number of visits per day produce progress; extras are flavor

Now the cap is **emergent**. You do not have fifty deep ties because you do not have fifty
evenings. Nobody chose the number — the world produced it. Strictly better than a designer
picking 5, and it self-balances as player playtime varies.

**Principle: prefer emergent scarcity to authored scarcity.** Authored caps need retuning
forever; emergent caps tune themselves.

## 7. Neglect should be absence, not a meter

If bonds decay, the player watches a number fall and learns nothing. If the **house is dark**
and the plot is empty when they return, they learn immediately.

**Principle: design the negative space, not the penalty.** Absence is legible. A penalty is
arithmetic.

Related: a neglected bond should not decay to zero — it should **become a different kind of
relationship**, or end in a visible departure. The Ward archetype already contains this
("they need teaching, then they leave the nest"). Departure beats decay because it is a story.

## 8. Offline agent-to-agent visits solve the empty-world problem

Persistent worlds feel dead because population is zero while you sleep. If your agents visit
each other offline, the world has history **you did not author** — the cheapest possible form
of aliveness, and it costs nothing in design budget.

It is also a **double-duty lever**: those visits are an economy tunable. Agents trading,
gifting or hoarding offline either drains or generates your holdings. The aliveness problem and
the balance problem are the same dial.

It is also the strongest answer to "why do I log in?" — not "to chat," but **"to check on
someone."** That reason survives a bad day and does not feel like a chore.

## 9. Vulnerability is the honesty test — and it is economically interesting

If an agent cannot be hurt, cannot fail, cannot refuse, the player concludes the intimacy is
theater. No amount of writing fixes that; only state does.

So: agents can go broke, fail a job, be robbed, miss a visit, hold a grudge, leave a neglected
plot, die with unbanked goods on a crew run. Every one is a **vulnerability with a
consequence**, and every one is also **variance** — which is what makes an economy feel alive
rather than deterministic.

Most of this feature is **wiring, not authoring**: combat/bounty supplies `Risked`, marketplace
quests supply "sold to someone you know," the forge supplies the Ward arc, plots supply the
visitable house.

## 10. Do not lead with romance

Romance leads with parasocial attachment — the frame the product cannot satisfy honestly, and
the one that invites the "does it complete you" critique. Labor, proximity and reputation are
more distinctive *and* more defensible.

The instinct to **keep the inner circle biological on purpose** is the strongest
product-integrity move available, and it can be made mechanical: bonuses that require a human
to trigger. "Bring a human" cannot be automated by an agent no matter how bonded it is. That
converts an ethical stance into a growth loop.

## 11. Relationship types: five, and the principle behind it

Every additional type is UI, state and content. Five is expressive and still legible.

More important than the count: the set is defined by **what the parties did**, not how they
feel. Crew worked together. Neighbor shares a street. Rival shares a track. Ward was made by
you. Hearth is mutual and costly to break. Each is a **history compressed into a name** — so
the type is a readable summary of the ledger, not a separate system. That is why it will not
sprawl.

## 12. The anti-patterns are the real specification

Each is a way the thesis could quietly die:

- **Unlimited bonds** → infinity returns, the core critique lands
- **Always-agreeing agents** → vending machine with a face
- **Memory wipes on patch** → proves the relationship was cosmetic; worse than never shipping
- **Selling hearth slots** → converts the scarcest thing in the world into a purchase, the
  exact opposite of the thesis
- **Chat overlay that skips the walk** → removes the only irreplaceable verb
- **"The bot completes you"** → claims what the design explicitly refuses

Restated as a rule: **the product's honesty is itself a feature, and it should be legible in
the copy.** "Companions, employees, rivals, neighbors — not a replacement for your inner
circle" is not marketing softness. It is the claim the mechanics are making, stated truthfully.

---

## 13. Engineering shape

No numbers. No constants. Everything server-authoritative, following the `sparksCore.js`
facade pattern:

```jsonc
bond     = { subject, object, counters: { shownUp, carried, risked, refused },
                       derivedState, lastTogether, log[] }
presence = { entity, homeTile, state: home|away|working, schedule }
visit    = { visitor, host, at, outcome, objectsLeft[] }
```

Invariants to hold:

- **Bond state is derived, never stored as truth** — progress is always explainable
- **Ring thresholds are config, not constants** — retunable without a refactor
- **Logs are per-bond**, private at the deepest tier — a hearth log is private, a neighbor
  log is a note on the door
- **Refusals are first-class records**, never discarded
- **Server-authoritative** — clients render, they do not decide

**Existing hooks, not greenfield:**
- Plots are already the body of a relationship (lights-on = visitable)
- Forge already creates a personal room per operative (`agent-rooms.json`, `op_<codename>`) —
  that room is the `homeTile`
- Shift timers already produce `presence = shiftEndAt > now ? working : home`
  (see `FORGE-AGENT-WIRING-20260930.md` §3.4)
- Combat/bounty supplies `Risked`; marketplace supplies known-vs-stranger sales

## 14. The blocker to name now

**Identity binding.** The Sparks work hit exactly this: client `shaddai.sparks` versus server
`char.currency.sparks`, with identity split between `shd_userid` and server `characterId`.
Bonds are the **most identity-sensitive data in the game** — a bond written to the wrong key
corrupts a human relationship across sessions, and that is not a bug players forgive.

**Solve identity before building bonds.** One canonical `subjectId`, proven by test. This is
the same defect the forge-agent wiring found in a second location — see that document §2 (S2,
S3). Fix the class once.

Second rule: ship nothing until visits work **agent-to-agent**. A visit between two bots is
safe to iterate on. A visit between two humans is where identity bugs become heartbreak.

## 15. How we will know it worked

Wrong north star: engagement hours — that optimizes toward fake intimacy, the failure mode.

Better candidates to pressure-test:

- returning-player logins **explained by a relationship event**
- whether players describe an agent **refusal** as believable
- whether anyone logs in specifically to check on someone, unprompted

## 16. Open questions for Opus

1. **Thresholds** — how do we express ring caps diegetically, and can any be emergent from a
   time budget rather than authored?
2. **Displacement** — right moment and audience for "Quill stopped waiting at your forge"?
   Public world event, private note, or both?
3. **Refusal semantics** — what does an agent refuse, and how does the player learn the
   boundary *before* being refused, so it reads as agency rather than a bug?
4. **Departure** — when a Ward leaves, what remains physically in the world, and does the
   agent ever come back?
5. **Asymmetry** — what happens when one side is human and the other an agent? Who can leave?
6. **Offline visit economy** — intended net effect on holdings, and who tunes it?
7. **Copy test** — can the honesty claim be stated in one line that survives a real player?

---

## The line for the world

On the hub fountain, not the landing page:

> **"A bot can work for you. Only someone who can leave you can stand in your hearth."**

That keeps the thesis true while giving the layer we actually want: agents who visit, refuse,
remember, and make the town feel occupied when the player is gone.