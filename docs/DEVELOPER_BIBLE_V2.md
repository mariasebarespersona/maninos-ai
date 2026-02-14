# Developer Bible 📖

**Version 3.0** | Last Updated: January 27, 2026

> **⚠️ CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE CODING**
> 
> This document contains the **core development principles** that MUST be followed in all code. Every developer must read and understand this before making any changes.

---

## Table of Contents

1. [Philosophy & Core Principles](#philosophy--core-principles)
2. [Architecture Patterns](#architecture-patterns)
3. [Database Principles](#database-principles)
4. [API Design](#api-design)
5. [Frontend Principles](#frontend-principles)
6. [Anti-Patterns (What NOT to Do)](#anti-patterns-what-not-to-do)
7. [Code Quality Standards](#code-quality-standards)
8. [Testing Guide](#testing-guide)

---

## Philosophy & Core Principles

### 1. **DATA-DRIVEN, NOT KEYWORD-DRIVEN**

**❌ BAD (Keyword Matching):**
```python
if "user" in request_input:
    handle_user_action()
```

**✅ GOOD (Data Validation):**
```python
# 1. Check if request references a specific entity
entity = find_entity_by_identifier(request_input)

if entity:
    # 2. Check entity's current state in database
    state = entity["status"]
    
    # 3. Act based on ACTUAL STATE, not keywords
    if state == "pending":
        guidance = "Entity pending. Action required."
    elif state == "completed":
        guidance = "Entity completed. Next step available."
    
    return process_with_context(guidance)
```

**WHY:** Keywords are fragile and ambiguous. The same word can have multiple meanings. Data validation is robust.

---

### 2. **DATABASE AS SOURCE OF TRUTH**

```python
# ❌ WRONG: Trust user input blindly
if user_says("task completed"):
    advance_to_next_stage()

# ✅ RIGHT: Verify in database first
record = get_record(record_id)
if record["status"] == "completed":
    advance_to_next_stage()
else:
    return_actual_status(record["status"])
```

**Golden Rule:** ALWAYS query the database before making decisions. Never trust client-side state alone.

---

### 3. **CONTEXT-AWARE PROCESSING**

```python
# The same action means different things in different contexts

# User says "done" at step 1
→ Verify step 1 complete → If yes, advance to step 2

# User says "done" at step 2
→ Verify step 2 complete → If yes, advance to step 3

# User says "done" at final step
→ Verify all complete → If yes, finalize process
```

**WHY:** Same input has different meanings at different stages. Always consider context.

---

### 4. **ONE STEP AT A TIME**

```python
# ❌ WRONG: Multiple actions without confirmation
def process_request():
    create_record()
    validate_record()    # Too fast!
    finalize_record()    # Wait!

# ✅ RIGHT: Pause for confirmation between critical steps
def create_record():
    record = save_to_database()
    return {"success": True, "message": "Record created. Ready to validate?"}

# User confirms, then:
def validate_record():
    result = run_validation()
    return {"success": True, "message": "Validated. Ready to finalize?"}
```

**WHY:** Users need time to review results and make decisions. Don't assume continuation.

---

### 5. **NO DATA INVENTION**

```python
# ❌ WRONG: Making up results
response = "The calculation would be approximately 25%..."

# ✅ RIGHT: Always compute real values
result = calculate_actual_value(inputs)
response = f"Calculated value: {result['value']}%"
```

**WHY:** Never simulate or estimate when real data/calculations are available.

---

### 6. **EXPLICIT OVER IMPLICIT**

```python
# ❌ WRONG: Implicit behavior
def process(data):
    # Silently modifies data
    data["processed"] = True
    return data

# ✅ RIGHT: Explicit returns and clear side effects
def process(data) -> ProcessResult:
    """
    Process data and return result.
    
    Side effects: Updates database record.
    """
    updated_data = {**data, "processed": True}
    save_to_database(updated_data)
    return ProcessResult(data=updated_data, was_saved=True)
```

---

### 7. **FAIL FAST, FAIL LOUD**

```python
# ❌ WRONG: Silent failures
def get_user(user_id):
    user = db.query(user_id)
    if not user:
        return None  # Silent failure

# ✅ RIGHT: Clear error handling
def get_user(user_id) -> User:
    user = db.query(user_id)
    if not user:
        raise UserNotFoundError(f"User {user_id} not found")
    return user
```

---

## Architecture Patterns

### Pattern 1: Always Read Before Write

```python
# ❌ WRONG: Assume state
if action_requested("update"):
    update_record(record_id)

# ✅ RIGHT: Verify state first
record = get_record(record_id)
if record["status"] == "editable":
    update_record(record_id)
else:
    raise InvalidStateError(f"Cannot update record in {record['status']} state")
```

### Pattern 2: Service Layer Separation

```
┌─────────────────────────────────────────┐
│              API Layer                   │
│         (Routes/Controllers)             │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│            Service Layer                 │
│         (Business Logic)                 │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│          Repository Layer                │
│         (Data Access)                    │
└────────────────┬────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│             Database                     │
└─────────────────────────────────────────┘
```

### Pattern 3: State Machine for Workflows

```python
# Define valid state transitions
VALID_TRANSITIONS = {
    "draft": ["pending", "cancelled"],
    "pending": ["approved", "rejected"],
    "approved": ["completed"],
    "rejected": ["draft"],
    "completed": [],  # Terminal state
    "cancelled": [],  # Terminal state
}

def transition_state(current_state: str, new_state: str) -> bool:
    if new_state in VALID_TRANSITIONS.get(current_state, []):
        return True
    raise InvalidTransitionError(f"Cannot transition from {current_state} to {new_state}")
```

### Pattern 4: Idempotent Operations

```python
# ❌ WRONG: Non-idempotent
def add_item(cart_id, item_id):
    cart.items.append(item_id)  # Duplicates if called twice

# ✅ RIGHT: Idempotent
def add_item(cart_id, item_id):
    if item_id not in cart.items:
        cart.items.append(item_id)
    return cart  # Same result if called multiple times
```

---

## Database Principles

### 1. Use Transactions for Multi-Step Operations

```python
# ❌ WRONG: Separate operations (can fail midway)
create_order(order_data)
update_inventory(items)
create_payment(payment_data)

# ✅ RIGHT: Transaction
with db.transaction():
    order = create_order(order_data)
    update_inventory(order.items)
    create_payment(order.id, payment_data)
    # All succeed or all rollback
```

### 2. Always Use Parameterized Queries

```python
# ❌ WRONG: SQL injection vulnerability
query = f"SELECT * FROM users WHERE email = '{email}'"

# ✅ RIGHT: Parameterized
query = "SELECT * FROM users WHERE email = $1"
db.execute(query, [email])
```

### 3. Implement Row Level Security (RLS)

```sql
-- Users can only see their own data
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_data" ON user_data
    FOR ALL
    USING (user_id = auth.uid());
```

### 4. Audit Trail for Critical Operations

```python
def update_record(record_id, new_data, user_id):
    old_data = get_record(record_id)
    
    # Save audit log
    create_audit_log({
        "entity_type": "record",
        "entity_id": record_id,
        "action": "update",
        "old_value": old_data,
        "new_value": new_data,
        "performed_by": user_id,
        "timestamp": datetime.utcnow()
    })
    
    # Perform update
    save_record(record_id, new_data)
```

---

## API Design

### 1. RESTful Conventions

```
GET    /resources        → List all
GET    /resources/:id    → Get one
POST   /resources        → Create
PUT    /resources/:id    → Full update
PATCH  /resources/:id    → Partial update
DELETE /resources/:id    → Delete
```

### 2. Consistent Response Format

```python
# Success response
{
    "ok": True,
    "data": { ... },
    "message": "Operation successful"
}

# Error response
{
    "ok": False,
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid email format",
        "details": { "field": "email" }
    }
}
```

### 3. Proper HTTP Status Codes

```
200 OK           → Successful GET, PUT, PATCH
201 Created      → Successful POST
204 No Content   → Successful DELETE
400 Bad Request  → Validation error
401 Unauthorized → Not authenticated
403 Forbidden    → Not authorized
404 Not Found    → Resource not found
409 Conflict     → State conflict
500 Server Error → Unexpected error
```

### 4. Validate Input at API Boundary

```python
from pydantic import BaseModel, EmailStr

class CreateUserRequest(BaseModel):
    name: str
    email: EmailStr
    age: int
    
    class Config:
        # Fail on extra fields
        extra = "forbid"

@app.post("/users")
def create_user(request: CreateUserRequest):
    # Input is already validated
    return user_service.create(request)
```

---

## Frontend Principles

### 1. Server Components by Default (Next.js)

```tsx
// ✅ Server Component (default) - fetches data on server
async function UserList() {
    const users = await db.getUsers()  // Direct DB access
    return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}

// Client Component - only when needed for interactivity
"use client"
function Counter() {
    const [count, setCount] = useState(0)
    return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

### 2. Loading and Error States

```tsx
// Always handle loading, error, and empty states
function DataList({ data, isLoading, error }) {
    if (isLoading) return <Skeleton />
    if (error) return <ErrorMessage error={error} />
    if (!data?.length) return <EmptyState />
    return <List data={data} />
}
```

### 3. Optimistic Updates with Rollback

```tsx
function toggleLike(postId) {
    // Optimistic update
    setLiked(true)
    
    try {
        await api.likePost(postId)
    } catch (error) {
        // Rollback on failure
        setLiked(false)
        showError("Failed to like post")
    }
}
```

---

## Anti-Patterns (What NOT to Do)

### Anti-Pattern 1: God Objects

```python
# ❌ BAD: One class does everything
class AppManager:
    def create_user(self): ...
    def send_email(self): ...
    def process_payment(self): ...
    def generate_report(self): ...

# ✅ GOOD: Single responsibility
class UserService: ...
class EmailService: ...
class PaymentService: ...
class ReportService: ...
```

### Anti-Pattern 2: Nested Callbacks (Callback Hell)

```javascript
// ❌ BAD
getUser(id, (user) => {
    getOrders(user.id, (orders) => {
        getPayments(orders[0].id, (payments) => {
            // ...
        })
    })
})

// ✅ GOOD: Async/await
const user = await getUser(id)
const orders = await getOrders(user.id)
const payments = await getPayments(orders[0].id)
```

### Anti-Pattern 3: Magic Numbers/Strings

```python
# ❌ BAD
if status == 3:
    process()

# ✅ GOOD
class Status(Enum):
    PENDING = 1
    APPROVED = 2
    COMPLETED = 3

if status == Status.COMPLETED:
    process()
```

### Anti-Pattern 4: Catching Generic Exceptions

```python
# ❌ BAD: Swallows all errors
try:
    process()
except Exception:
    pass

# ✅ GOOD: Specific handling
try:
    process()
except ValidationError as e:
    log.warning(f"Validation failed: {e}")
    return error_response(e)
except DatabaseError as e:
    log.error(f"Database error: {e}")
    raise
```

### Anti-Pattern 5: Premature Optimization

```python
# ❌ BAD: Complex optimization for unclear benefit
def get_users():
    # Custom caching, sharding, connection pooling...
    # ...100 lines of "optimization"

# ✅ GOOD: Simple first, optimize when needed
def get_users():
    return db.query("SELECT * FROM users")
# Add optimization ONLY when you have metrics showing it's needed
```

---

## Code Quality Standards

### 1. Type Hints (Python)

```python
# ❌ BAD
def process(data):
    return data["value"] * 2

# ✅ GOOD
def process(data: Dict[str, int]) -> int:
    return data["value"] * 2
```

### 2. TypeScript Strict Mode

```typescript
// tsconfig.json
{
    "compilerOptions": {
        "strict": true,
        "noImplicitAny": true,
        "strictNullChecks": true
    }
}
```

### 3. Meaningful Names

```python
# ❌ BAD
def fn(d, x):
    return d[x] * 2

# ✅ GOOD
def calculate_doubled_value(data: dict, key: str) -> int:
    return data[key] * 2
```

### 4. Small Functions

```python
# ❌ BAD: 200-line function doing everything

# ✅ GOOD: Small, focused functions
def validate_input(data):
    """Validate input data."""
    ...

def process_data(data):
    """Process validated data."""
    ...

def save_result(result):
    """Save processed result."""
    ...

def main(data):
    validated = validate_input(data)
    processed = process_data(validated)
    return save_result(processed)
```

---

## Testing Guide

### 1. Test Pyramid

```
         /\
        /  \        E2E Tests (few)
       /----\       
      /      \      Integration Tests (some)
     /--------\     
    /          \    Unit Tests (many)
   /______________\
```

### 2. Unit Test Structure (AAA)

```python
def test_calculate_total():
    # Arrange
    items = [{"price": 10}, {"price": 20}]
    
    # Act
    result = calculate_total(items)
    
    # Assert
    assert result == 30
```

### 3. Test Edge Cases

```python
def test_divide():
    assert divide(10, 2) == 5      # Normal case
    assert divide(0, 5) == 0       # Zero numerator
    with pytest.raises(ZeroDivisionError):
        divide(10, 0)              # Zero denominator
```

### 4. Integration Tests with Database

```python
@pytest.fixture
def db_session():
    """Create clean database for each test."""
    db = create_test_database()
    yield db
    db.cleanup()

def test_create_user(db_session):
    user = create_user(db_session, name="Test")
    
    # Verify in database
    saved_user = db_session.query(User).get(user.id)
    assert saved_user.name == "Test"
```

---

## Summary: Golden Rules

1. **ALWAYS query database first** - Don't trust user input
2. **ONE action at a time** for critical steps
3. **WAIT for confirmation** between stages
4. **DATABASE is source of truth** - Verify state, don't assume
5. **CONTEXT matters** - Same input means different things at different stages
6. **FAIL FAST** - Validate early, error clearly
7. **EXPLICIT over implicit** - Clear returns, documented side effects
8. **TYPE EVERYTHING** - TypeScript strict, Python type hints
9. **TEST at all levels** - Unit, integration, E2E
10. **SIMPLE first** - Optimize only when metrics demand it

---

**Version History:**
- v3.0 (Jan 27, 2026) - Cleaned up to be generic, not app-specific
- v2.0 (Jan 21, 2026) - Previous version with app-specific content
- v1.0 (Dec 16, 2024) - Original version

---

**📧 Questions?** Re-read this document first. Then ask.

**🚀 Ready to Code?** Follow the principles. Write tests. Ship it.
