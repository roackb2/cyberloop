# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the CyberLoop framework.

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important architectural decision made along with its context and consequences.

ADRs help us:
- **Remember why** we made certain decisions
- **Communicate** architectural choices to new team members
- **Track** the evolution of the architecture over time
- **Avoid** revisiting settled decisions
- **Learn** from past decisions (good and bad)

## When to Write an ADR

Write an ADR when you make a decision that:
- Affects the structure, behavior, or quality attributes of the system
- Is difficult or expensive to reverse
- Impacts multiple components or stakeholders
- Represents a significant trade-off
- Deviates from established patterns or conventions

Examples:
- Choosing a core architecture pattern (e.g., Inner/Outer Loop)
- Selecting a major technology or framework
- Defining interfaces or contracts
- Establishing coding standards or conventions
- Making significant performance or security trade-offs

## How to Write an ADR

1. **Copy the template:** Use `0000-adr-template.md` as a starting point
2. **Number it:** Use the next available number (e.g., `0002-...`)
3. **Title it:** Use a clear, descriptive title
4. **Fill it out:** Follow the template sections
5. **Review it:** Get feedback from relevant stakeholders
6. **Commit it:** Add it to version control

### Template Sections

- **Status:** Current state of the decision (Proposed/Accepted/Deprecated/Superseded)
- **Context:** What problem are we solving? What constraints exist?
- **Decision:** What did we decide to do?
- **Rationale:** Why did we choose this approach?
- **Consequences:** What are the positive, negative, and neutral outcomes?
- **Implementation Notes:** Practical details for implementation
- **Alternatives Considered:** What other options did we evaluate?
- **Related Decisions:** Links to other ADRs
- **References:** Supporting documents and resources

## ADR Lifecycle

```
Proposed → Accepted → [Deprecated | Superseded]
```

- **Proposed:** Under discussion, not yet implemented
- **Accepted:** Decision made and being/been implemented
- **Deprecated:** No longer recommended but not replaced
- **Superseded:** Replaced by another ADR (link to it)

## Naming Convention

```
NNNN-short-title-in-kebab-case.md
```

Examples:
- `0001-inner-outer-loop-architecture.md`
- `0002-budget-tracking-strategy.md`
- `0003-probe-policy-interface.md`

## Index of ADRs

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [0000](0000-adr-template.md) | ADR Template | Template | - |
| [0001](0001-inner-outer-loop-architecture.md) | Inner/Outer Loop Architecture | Accepted | 2025-10-11 |

## Best Practices

### Do:
- ✅ Write ADRs **as decisions are made**, not after the fact
- ✅ Keep them **concise** but complete (aim for 1-3 pages)
- ✅ Focus on **why**, not just what
- ✅ Include **concrete examples** and diagrams
- ✅ Document **alternatives considered**
- ✅ Update status when decisions change
- ✅ Link to related ADRs and documents

### Don't:
- ❌ Write ADRs for trivial decisions
- ❌ Delete or modify old ADRs (supersede them instead)
- ❌ Use ADRs as detailed design documents (keep them high-level)
- ❌ Skip the "Consequences" section (trade-offs are important!)
- ❌ Forget to update the index above

## Tools and Resources

### ADR Tools
- [adr-tools](https://github.com/npryce/adr-tools) - Command-line tools for ADRs
- [log4brains](https://github.com/thomvaill/log4brains) - Web UI for ADRs

### Further Reading
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) - Michael Nygard (original ADR concept)
- [MADR](https://adr.github.io/madr/) - Markdown Any Decision Records template
- [ADR GitHub Organization](https://adr.github.io/) - Collection of ADR resources

## Contributing

When adding a new ADR:

1. Create a new file using the template
2. Number it sequentially (check existing ADRs)
3. Fill out all sections thoroughly
4. Add it to the index table above
5. Submit a pull request for review
6. Update status to "Accepted" after approval

## Questions?

If you're unsure whether to write an ADR, ask yourself:
- Will future developers wonder why we made this choice?
- Is this decision hard to reverse?
- Does this affect multiple parts of the system?
- Are there significant trade-offs involved?

If you answered "yes" to any of these, write an ADR!
