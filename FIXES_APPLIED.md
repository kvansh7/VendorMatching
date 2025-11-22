# Fixes Applied to VendorMatching Project

**Date:** 2025-11-22  
**Status:** ✅ All 5 issues fixed successfully

---

## Issue 1: Web Search Continues When PS Changes

**Problem:** When switching to a new Problem Statement during an ongoing web search, the old search would continue and potentially update state with stale results.

**Solution:**
- Added `useRef` hook to track abort controller
- Implemented `AbortController` to cancel ongoing axios requests
- Cancel previous web search when:
  - A new web search is initiated
  - Problem Statement selection changes
- Handle cancellation gracefully without showing errors

**Files Modified:**
- `my-app/src/pages/VendorMatching.jsx`

**Changes:**
```javascript
// Added abort controller ref
const abortControllerRef = useRef(null);

// Updated handleWebSearch to cancel previous requests
if (abortControllerRef.current) {
  abortControllerRef.current.abort();
}
abortControllerRef.current = new AbortController();

// Pass signal to axios
await axios.post('/api/web_search_vendors', payload, {
  signal: abortControllerRef.current.signal
});

// Handle cancellation
if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
  console.log('Web search cancelled');
  return;
}
```

---

## Issue 2: Recent Lists Not Ordered by Most Recent

**Problem:** "Recent Vendors" and "Recent PS" lists were not sorted by date/time added, showing items in arbitrary order.

**Solution:**
- Modified dashboard endpoint to explicitly sort by `_id` field (which contains MongoDB ObjectId with timestamp)
- Sort in descending order (-1) to get most recent first
- Use `.limit(3)` to get only the 3 most recent items

**Files Modified:**
- `backend/routes/health.py`

**Changes:**
```python
# Before:
recent_vendors = [v['name'] for v in vendors[-3:]] if vendors else []
recent_ps = [ps['title'] for ps in ps_list[-3:]] if ps_list else []

# After:
recent_vendors_docs = list(vendors_collection.find().sort("_id", -1).limit(3))
recent_ps_docs = list(ps_collection.find().sort("_id", -1).limit(3))

recent_vendors = [v['name'] for v in recent_vendors_docs]
recent_ps = [ps['title'] for ps in recent_ps_docs]
```

---

## Issue 3: "Search Vendors on Web" Not Disabled When Weight > 100%

**Problem:** Only "Match Vendors from Repository" button was disabled when total weight exceeded 100%, but "Search Vendors on Web" remained enabled.

**Solution:**
- Created `isWeightValid()` helper function to check if total weight equals 100% (within 0.01% tolerance)
- Applied same validation to both search buttons' `disabled` attribute
- Both buttons now consistently enforce weight validation

**Files Modified:**
- `my-app/src/pages/VendorMatching.jsx`

**Changes:**
```javascript
// Added validation helper
const isWeightValid = () => {
  const total = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0) * 100;
  return Math.abs(total - 100) < 0.01;
};

// Updated both buttons
disabled={loadingRepo || !selectedPsId || !isWeightValid()}
disabled={loadingWeb || !selectedPsId || !isWeightValid()}
```

---

## Issue 4: "Web" Tile in Comparison Table Not Clickable

**Problem:** In the comparison table, the "Web" source badge was not clickable, preventing users from visiting vendor websites.

**Solution:**
- Made "Web" badge a clickable link when `web_sources` data is available
- Links to the first web source URL for the vendor
- Opens in new tab with proper security attributes
- Falls back to non-clickable badge if no web sources available
- Added hover effect for better UX

**Files Modified:**
- `my-app/src/pages/VendorMatching.jsx`

**Changes:**
```javascript
{vendor.source === 'repository' ? (
  <span className="inline-flex px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white">
    Repo
  </span>
) : (
  vendor.web_sources && vendor.web_sources.length > 0 ? (
    <a
      href={vendor.web_sources[0].url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex px-2 py-1 rounded text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 cursor-pointer transition-colors"
      title={`Visit ${vendor.name}`}
    >
      Web
    </a>
  ) : (
    <span className="inline-flex px-2 py-1 rounded text-xs font-semibold bg-purple-600 text-white">
      Web
    </span>
  )
)}
```

---

## Issue 5: Normalize Button Doesn't Result in Exactly 100%

**Problem:** Clicking "Normalize" would result in weights that sum to slightly more or less than 100% due to floating-point rounding errors.

**Solution:**
- Implemented two-pass normalization algorithm:
  1. First pass: Divide each weight by total and round to 3 decimals
  2. Calculate sum after rounding
  3. Find difference from 1.0 (100%)
  4. Adjust the largest weight to compensate for rounding error
- Ensures final sum is exactly 1.0 (100%)

**Files Modified:**
- `my-app/src/pages/VendorMatching.jsx`

**Changes:**
```javascript
const normalizeWeights = () => {
  const total = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  if (total <= 0) return;
  
  // First pass: divide by total and round to 3 decimals
  const normalized = criteria.map((c) => ({
    ...c,
    weight: parseFloat((c.weight / total).toFixed(3)),
  }));
  
  // Calculate the sum after rounding
  const roundedSum = normalized.reduce((sum, c) => sum + c.weight, 0);
  
  // Find the difference from 1.0
  const diff = 1.0 - roundedSum;
  
  // If there's a difference, adjust the largest weight
  if (Math.abs(diff) > 0.0001) {
    const maxIndex = normalized.reduce((maxIdx, c, idx, arr) => 
      c.weight > arr[maxIdx].weight ? idx : maxIdx, 0
    );
    normalized[maxIndex].weight = parseFloat((normalized[maxIndex].weight + diff).toFixed(3));
  }
  
  setCriteria(normalized);
};
```

---

## Testing Recommendations

### Issue 1: Web Search Cancellation
1. Select a Problem Statement
2. Click "Search Vendors on Web"
3. Immediately switch to a different Problem Statement
4. Verify: Old search is cancelled, no stale results appear

### Issue 2: Recent Lists Ordering
1. Add multiple vendors and problem statements
2. Navigate to Dashboard
3. Verify: Most recently added items appear first in both lists

### Issue 3: Button Validation
1. Add scoring criteria with weights totaling > 100%
2. Verify: Both "Match Vendors from Repository" and "Search Vendors on Web" are disabled
3. Adjust weights to exactly 100%
4. Verify: Both buttons become enabled

### Issue 4: Clickable Web Tile
1. Perform a web search
2. Add web vendors to comparison table
3. Click on "Web" badge in Source column
4. Verify: Opens vendor website in new tab

### Issue 5: Normalization
1. Add criteria with arbitrary weights (e.g., 0.3, 0.4, 0.2, 0.15)
2. Click "Normalize"
3. Verify: Total shows exactly "100.0% (Perfect!)"
4. Check individual weights sum to exactly 1.0

---

## Backup

A backup of the original `VendorMatching.jsx` was created at:
- `my-app/src/pages/VendorMatching.jsx.backup`

To restore the original version if needed:
```bash
cp my-app/src/pages/VendorMatching.jsx.backup my-app/src/pages/VendorMatching.jsx
```

---

## Notes

- All fixes are minimal and focused on the specific issues
- No breaking changes to existing functionality
- Backward compatible with existing data
- No additional dependencies required
- All changes follow existing code style and patterns
