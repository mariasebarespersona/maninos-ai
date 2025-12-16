# MANINOS AI Documentation

**Welcome to the MANINOS AI documentation hub!**

This directory contains comprehensive documentation for developers, stakeholders, and operators working on the mobile home acquisition AI assistant.

---

## ⭐ **START HERE - Essential Reading**

### 📖 **[DEVELOPER_BIBLE.md](./DEVELOPER_BIBLE.md)** (🔥 MUST READ FIRST)
**~7,500 lines | For: ALL Developers**

**⚠️ READ THIS ENTIRE DOCUMENT BEFORE CODING**

The definitive guide to understanding MANINOS AI. Covers:
- **Philosophy & Core Principles** (data-driven, not keyword-driven)
- **System Architecture Overview** (FastAPI → Orchestrator → FlowValidator → PropertyAgent → Tools)
- **The 6-Step Acquisition Workflow** (documents → 70% → inspection → 80% → contract)
- **Agent System Deep Dive** (BaseAgent ReAct loop, PropertyAgent)
- **Routing System** (FlowValidator, ActiveRouter, Orchestrator)
- **Tool System & Registry** (22 tools, auto-stage updates)
- **Prompt System** (modular architecture, dynamic composition)
- **State Management** (LangGraph, PostgreSQL checkpointing)
- **Database Schema** (10 acquisition stages, enforced workflow)
- **Critical Design Patterns** (always read property first, one tool per turn)
- **Anti-Patterns** (what NOT to do)
- **Testing & Validation** (complete flow tests)
- **Debugging Guide** (common issues and fixes)
- **Common Gotchas** (repair_estimate=0 vs None, etc.)

**Use this when:**
- Joining the team (mandatory reading)
- Before making ANY code changes
- Debugging complex issues
- Conducting code reviews
- Planning new features

**Estimated Reading Time:** 3-4 hours (worth every minute)

---

### ⚡ **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** (For Daily Use)
**Quick lookup guide | For: Developers who read the Bible**

Fast reference for:
- Architecture cheat sheet
- File structure map
- 6 steps copy-paste reference
- Common code patterns
- Tool reference (with signatures)
- Stage transition table
- FlowValidator usage
- Defect costs
- Database queries
- Testing commands
- Debugging commands

**Use this when:**
- Need quick code snippets
- Forgot a tool signature
- Need to check stage transitions
- Looking up defect costs
- Running tests

**Reading Time:** 15 minutes

---

### 🏛️ **[ARCHITECTURAL_DECISIONS.md](./ARCHITECTURAL_DECISIONS.md)** (The "Why")
**10 ADRs | For: Architects, Senior Developers**

Explains the "why" behind key architectural choices:
- **ADR-001:** One Agent for Linear Workflow (vs multi-agent)
- **ADR-002:** Data-Driven Routing Over Keywords
- **ADR-003:** Modular Prompt System
- **ADR-004:** FlowValidator as Routing Brain
- **ADR-005:** Tools Auto-Update Stages
- **ADR-006:** Blocking Stages for Human Review
- **ADR-007:** PostgreSQL Checkpointing
- **ADR-008:** No Intermediate Agent Consolidation
- **ADR-009:** UI Components Not in Chat
- **ADR-010:** One Tool Per Turn in Critical Steps

**Use this when:**
- Understanding architectural decisions
- Proposing system changes
- Conducting architecture reviews
- Onboarding senior developers
- Planning future enhancements

**Reading Time:** 1 hour

---

## 📚 Additional Documentation

### **🏗️ Architecture & Design**

#### 1. **[TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md)** (⭐ Start Here)
**100+ pages | For: Developers, Architects**

Complete technical documentation covering:
- Tech stack (Python, TypeScript, LangGraph, PostgreSQL)
- System architecture with detailed Mermaid diagrams
- Core components deep dive (FastAPI, LangGraph, Agents)
- Agent architecture (BaseAgent, ReAct loops, specialized agents)
- Routing system (ActiveRouter + Orchestrator)
- Modular prompt system (architecture, benefits, examples)
- Data flow with sequence diagrams
- Database schema and persistence
- Frontend architecture (Next.js, React, Tailwind)
- Deployment (Render, Vercel, env vars)
- Performance & scalability analysis
- Security considerations

**Use this when:**
- Onboarding new developers
- Conducting architecture reviews
- Planning system improvements
- Debugging complex issues

---

#### 2. **[ARCHITECTURE_VISUAL_GUIDE.md](./ARCHITECTURE_VISUAL_GUIDE.md)** (⭐ For Presentations)
**Visual reference | For: Stakeholders, Technical Presentations**

Quick reference guide with:
- One-page system overview
- 9 Mermaid diagrams (architecture, flows, routing)
- Tech stack comparison tables
- Performance metrics & cost analysis
- Security checklist
- Frontend design system
- Debugging tips
- Quick start guide

**Use this when:**
- Presenting to executives/stakeholders
- Technical demos
- Team onboarding (visual learners)
- Quick reference during development

---

### **🚀 Deployment & Operations**

#### 3. **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)**
**Backend deployment guide**

Step-by-step instructions for deploying the FastAPI backend to Render.

---

#### 4. **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)**
**Frontend deployment guide**

Step-by-step instructions for deploying the Next.js frontend to Vercel.

---

#### 5. **[DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md)**
**Pre-deployment checklist**

Complete checklist before going to production.

---

#### 6. **[OPS.md](./OPS.md)**
**Operations runbook**

Day-to-day operational procedures, monitoring, and troubleshooting.

---

### **📊 Evaluation & Quality**

#### 7. **[EVALUATION_ARCHITECTURE.md](./EVALUATION_ARCHITECTURE.md)**
**Evaluation pipeline design**

Architecture for automated agent evaluation (tool selection, response quality, task success).

---

#### 8. **[EVALUATION_STRATEGY.md](./EVALUATION_STRATEGY.md)**
**Evaluation methodology**

Strategy and metrics for continuous agent improvement.

---

#### 9. **[EVALUATION_QUICK_START.md](./EVALUATION_QUICK_START.md)**
**Evaluation setup guide**

How to set up and use the evaluation pipeline.

---

### **👥 User Guides**

#### 10. **[USER_FLOWS.md](../USER_FLOWS.md)**
**End-user workflows**

Common user workflows and expected agent behavior.

---


### **🔧 Features & Integrations**

#### 12. **[MULTI_AGENT_TOPOLOGY.md](./MULTI_AGENT_TOPOLOGY.md)**
**Multi-agent system design**

Overview of specialized agents and routing strategy.

---

#### 13. **[BIDIRECTIONAL_ROUTING.md](./BIDIRECTIONAL_ROUTING.md)**
**Bidirectional routing**

How agents can redirect/escalate to other agents.

---

#### 14. **[GRAPH_MODE.md](./GRAPH_MODE.md)**
**LangGraph mode**

Using LangGraph for stateful agent orchestration.

---

#### 15. **[LOGFIRE_SETUP.md](./LOGFIRE_SETUP.md)**
**Observability setup**

How to configure Logfire for LLM tracing and monitoring.

---

## 🎯 Quick Navigation

### I want to...

| Goal | Document |
|------|----------|
| **🔥 Start coding (mandatory)** | [DEVELOPER_BIBLE.md](./DEVELOPER_BIBLE.md) |
| **Quick lookup (daily use)** | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) |
| **Understand "why" decisions** | [ARCHITECTURAL_DECISIONS.md](./ARCHITECTURAL_DECISIONS.md) |
| **Understand the full system** | [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) |
| **Prepare a presentation** | [ARCHITECTURE_VISUAL_GUIDE.md](./ARCHITECTURE_VISUAL_GUIDE.md) |
| **Deploy to production** | [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) + [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) |
| **Debug an issue** | [DEVELOPER_BIBLE.md](./DEVELOPER_BIBLE.md) (Debugging Guide section) |
| **Onboard a developer** | [DEVELOPER_BIBLE.md](./DEVELOPER_BIBLE.md) → [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) |
| **Set up evaluation** | [EVALUATION_QUICK_START.md](./EVALUATION_QUICK_START.md) |
| **Monitor production** | [OPS.md](./OPS.md) + [LOGFIRE_SETUP.md](./LOGFIRE_SETUP.md) |
| **Add new feature** | [DEVELOPER_BIBLE.md](./DEVELOPER_BIBLE.md) + [ARCHITECTURAL_DECISIONS.md](./ARCHITECTURAL_DECISIONS.md) |

---

## 📖 Reading Order for New Developers

### 🚀 Day 1: Essential Understanding (4-5 hours)

1. **📖 MANDATORY:** [DEVELOPER_BIBLE.md](./DEVELOPER_BIBLE.md) (3-4 hours)
   - ⚠️ **CRITICAL:** Read this FIRST before touching any code
   - Understand philosophy (data-driven, not keyword-driven)
   - Learn the 6-step workflow
   - Understand agent system (BaseAgent, PropertyAgent)
   - Learn routing (FlowValidator, ActiveRouter, Orchestrator)
   - Master tool system
   - Study design patterns and anti-patterns
   - Review debugging guide

2. **⚡ Reference:** [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) (15 min)
   - Bookmark for daily use
   - Quick code patterns
   - Tool signatures
   - Database queries

3. **🏛️ Context:** [ARCHITECTURAL_DECISIONS.md](./ARCHITECTURAL_DECISIONS.md) (1 hour)
   - Understand why decisions were made
   - Learn from past mistakes
   - Prepare for future changes

---

### 🏗️ Day 2: Setup & Practice (3-4 hours)

4. **🔧 Setup:** [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) + [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) (1 hour)
   - Set up local environment
   - Run tests: `python tests/test_maninos_flow.py`
   - Deploy to staging

5. **🎨 Visual Reference:** [ARCHITECTURE_VISUAL_GUIDE.md](./ARCHITECTURE_VISUAL_GUIDE.md) (30 min)
   - See system diagrams
   - Understand component interactions
   - Use for presentations

6. **✅ Testing:** Run complete flow test (30 min)
   ```bash
   python tests/test_maninos_flow.py
   # Expected: ✅ ALL TESTS PASSED
   ```

7. **💬 Practice:** Test in UI (1-2 hours)
   - Create a test property
   - Go through complete 6-step workflow
   - Understand what users see

---

### 📚 Day 3+: Deep Dive (as needed)

8. **🏗️ Technical Deep Dive:** [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) (2-3 hours)
   - In-depth implementation details
   - Performance considerations
   - Security analysis

9. **🔬 Advanced:** [EVALUATION_ARCHITECTURE.md](./EVALUATION_ARCHITECTURE.md) (1 hour)
   - Evaluation pipeline
   - Quality metrics
   - Continuous improvement

---

**Total Onboarding Time:** 8-12 hours over 2-3 days

**Key Principle:** Read → Understand → Test → Code

---

## 🆘 Getting Help

### Internal Resources
1. **Check documentation** (this folder)
2. **Check code comments** (especially in `agentic.py`, `base_agent.py`)
3. **Check Logfire dashboard** (for runtime issues)
4. **Check GitHub Issues** (for known bugs)

### External Resources
- **LangGraph Docs:** https://langchain-ai.github.io/langgraph/
- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **Next.js Docs:** https://nextjs.org/docs
- **Supabase Docs:** https://supabase.com/docs

### Contact
- **Team Lead:** [Your Name]
- **DevOps:** [Your Name]
- **GitHub:** https://github.com/mariasebarespersona/tumai

---

## 🔄 Keeping Documentation Updated

### When to Update

| Change | Update These Docs |
|--------|-------------------|
| **New agent added** | TECHNICAL_ARCHITECTURE.md, ARCHITECTURE_VISUAL_GUIDE.md, MULTI_AGENT_TOPOLOGY.md |
| **New tool added** | TECHNICAL_ARCHITECTURE.md (Agent Architecture section) |
| **Deployment change** | DEPLOY_*.md, DEPLOYMENT_CHECKLIST.md |
| **New feature** | TECHNICAL_ARCHITECTURE.md, USER_FLOWS.md |
| **Architecture change** | TECHNICAL_ARCHITECTURE.md, ARCHITECTURE_VISUAL_GUIDE.md |
| **Performance optimization** | TECHNICAL_ARCHITECTURE.md (Performance section) |
| **Security update** | TECHNICAL_ARCHITECTURE.md (Security section) |

### Documentation Standards

1. **Diagrams:** Use Mermaid (renders in GitHub)
2. **Code examples:** Use syntax highlighting
3. **Tables:** Use Markdown tables for comparisons
4. **Links:** Use relative links within docs/
5. **Versioning:** Update "Last Updated" date at top of doc

---

## 📝 Documentation Style Guide

### Headings
```markdown
# H1 - Document Title
## H2 - Major Sections
### H3 - Subsections
#### H4 - Details
```

### Code Blocks
```markdown
\`\`\`python
def example():
    return "Use language tags"
\`\`\`
```

### Tables
```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
```

### Diagrams
```markdown
\`\`\`mermaid
graph TB
    A[Start] --> B[End]
\`\`\`
```

### Callouts
```markdown
**Note:** Important information
⚠️ **Warning:** Critical warning
✅ **Success:** Positive indicator
❌ **Error:** Problem indicator
```

---

## 📊 Documentation Metrics

| Document | Pages | Words | Last Updated | Status |
|----------|-------|-------|--------------|--------|
| 🔥 **DEVELOPER_BIBLE.md** | **120+** | **30,000+** | **Dec 2024** | **✅ Complete** |
| ⚡ **QUICK_REFERENCE.md** | **20+** | **5,000+** | **Dec 2024** | **✅ Complete** |
| 🏛️ **ARCHITECTURAL_DECISIONS.md** | **35+** | **10,000+** | **Dec 2024** | **✅ Complete** |
| TECHNICAL_ARCHITECTURE.md | 100+ | 15,000+ | Nov 2024 | ✅ Complete |
| ARCHITECTURE_VISUAL_GUIDE.md | 40+ | 8,000+ | Nov 2024 | ✅ Complete |
| CONSOLIDATED_ARCHITECTURE.md | 15+ | 3,000+ | Dec 2024 | ✅ Complete |
| INTELLIGENT_ROUTING.md | 20+ | 4,000+ | Dec 2024 | ✅ Complete |
| DEPLOY_RENDER.md | 5 | 1,000+ | Nov 2024 | ✅ Complete |
| DEPLOY_VERCEL.md | 5 | 1,000+ | Nov 2024 | ✅ Complete |
| EVALUATION_*.md | 20+ | 5,000+ | Nov 2024 | ✅ Complete |

**Total Documentation:** ~375 pages, ~82,000+ words

### New Documentation Highlights (v1.0 - Dec 2024)

**🔥 DEVELOPER_BIBLE.md** - The definitive guide
- 14 major sections
- 100+ code examples
- Complete system coverage
- Must-read for all developers

**⚡ QUICK_REFERENCE.md** - Daily use companion
- Fast lookup for common patterns
- Tool signatures
- Testing commands
- Debugging tips

**🏛️ ARCHITECTURAL_DECISIONS.md** - The "why" explained
- 10 detailed ADRs
- Trade-off analysis
- Lessons learned
- Future considerations

---

## 🎯 Documentation Goals

- ✅ **Comprehensive:** Cover all aspects of the system
- ✅ **Accessible:** Easy to find and navigate
- ✅ **Visual:** Diagrams and tables for clarity
- ✅ **Practical:** Real examples and use cases
- ✅ **Up-to-date:** Reflect current implementation
- ✅ **Scalable:** Easy to extend as system grows
- ✅ **Educational:** Explain "why" not just "how"
- ✅ **Reference:** Quick lookup for daily use

---

**Last Updated:** December 16, 2024  
**Maintained By:** MANINOS AI Team  
**Version:** 1.0  
**License:** Proprietary
