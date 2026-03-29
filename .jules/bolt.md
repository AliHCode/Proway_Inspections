## 2026-03-29 - O(N²) Array Filtering Anti-Pattern
**Learning:** Found multiple instances where the codebase filtered out superseded RFIs by using `rfis.some(child => child.parentId === r.id)` inside a `.filter()` or `.map()` loop over the same `rfis` array. This causes an O(N²) nested loop, heavily degrading performance as the number of RFIs grows (a common scenario).
**Action:** Always pre-compute a `Set` of parent IDs (`new Set(rfis.map(r => r.parentId).filter(Boolean))`) before the loops to convert the lookup into O(1), making the overall operation O(N).
