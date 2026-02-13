# Location System Resume & Auto-Save Fixes

## Problems Fixed

### 1. **Close Button Warning**
**Issue**: Clicking "X" on the modal warned "Your progress will be lost" even though data was being auto-saved.

**Solution**: Modified the close handler to check if auto-save is enabled and show appropriate message:
- ✅ If auto-saved: "Your progress has been auto-saved and you can resume later"
- ⚠️ If not saved: "Your progress will be lost"

**File**: `client/src/pages/ManualGenerator.tsx` (lines 4746-4777)

### 2. **Chunking State Not Persisted**
**Issue**: When resuming a session, the chunking state was lost:
- Lost track of which space/chunk we were on
- Lost accumulated chunk results
- Lost live map spaces
- Resumed at the wrong chunk or restarted the stage

**Solution**: Added `stageChunkState` to the progress session interface to preserve:
- `isStageChunking` - Whether we're in chunking mode
- `currentStageChunk` - Which chunk we're on
- `totalStageChunks` - Total chunks for this stage
- `accumulatedChunkResults` - All chunk results so far
- `liveMapSpaces` - All spaces added to the map
- `showLiveMap` - Whether map should be visible

## Files Modified

### 1. `client/src/utils/generationProgress.ts`

**Added StageChunkState interface** (lines 35-47):
```typescript
export interface StageChunkState {
  isStageChunking: boolean;
  currentStageChunk: number;
  totalStageChunks: number;
  accumulatedChunkResults: JsonRecord[];
  liveMapSpaces: Array<{
    name: string;
    dimensions?: string;
    function?: string;
    connections?: string[];
  }>;
  showLiveMap: boolean;
}
```

**Updated GenerationProgress interface** (line 55):
```typescript
export interface GenerationProgress {
  sessionId: string;
  createdAt: string;
  lastUpdatedAt: string;
  config: GenerationConfig;
  multiChunkState: MultiChunkState;
  stageChunkState?: StageChunkState; // NEW - Optional for backward compatibility
  progress: ProgressEntry[];
  stageResults: JsonRecord;
  factpack?: { ... };
  currentStageIndex: number;
}
```

### 2. `client/src/pages/ManualGenerator.tsx`

#### A. **Save Chunking State After Each Chunk** (lines 4093-4112)

Changed from:
```typescript
if (autoSaveEnabled && progressSession) {
  const savedSession = {
    ...progressSession,
    lastUpdatedAt: new Date().toISOString(),
    stageResults: updatedResults as unknown as Record<string, unknown>,
    currentStageIndex: currentStageIndex,
  };
  setProgressSession(savedSession);
  await saveProgress(savedSession);
}
```

To:
```typescript
if (autoSaveEnabled && progressSession) {
  const savedSession = {
    ...progressSession,
    lastUpdatedAt: new Date().toISOString(),
    stageResults: updatedResults as unknown as Record<string, unknown>,
    currentStageIndex: currentStageIndex,
    stageChunkState: {
      isStageChunking: true,
      currentStageChunk: nextChunkIndex,
      totalStageChunks: totalStageChunks,
      accumulatedChunkResults: newAccumulated,
      liveMapSpaces: liveMapSpaces,
      showLiveMap: showLiveMap,
    },
  };
  setProgressSession(savedSession);
  await saveProgress(savedSession);
  console.log(`[Auto-Save] Saved chunk ${currentStageChunk + 1}/${totalStageChunks}`);
}
```

#### B. **Clear Chunking State When Stage Completes** (lines 4157-4168)

Added auto-save to clear the chunking state:
```typescript
// Clear stage chunk state from progress session (chunking complete)
if (autoSaveEnabled && progressSession) {
  const clearedSession = {
    ...progressSession,
    lastUpdatedAt: new Date().toISOString(),
    stageResults: finalResults as unknown as Record<string, unknown>,
    stageChunkState: undefined, // Clear chunking state
  };
  setProgressSession(clearedSession);
  await saveProgress(clearedSession);
  console.log(`[Auto-Save] Cleared chunking state - stage complete`);
}
```

#### C. **Restore Chunking State on Resume** (lines 2196-2206)

Added to `handleResumeSession`:
```typescript
// Restore stage chunking state (for iterative location generation)
if (session.stageChunkState) {
  console.log('[Resume] Restoring stage chunking state:', session.stageChunkState);
  setIsStageChunking(session.stageChunkState.isStageChunking);
  setCurrentStageChunk(session.stageChunkState.currentStageChunk);
  setTotalStageChunks(session.stageChunkState.totalStageChunks);
  setAccumulatedChunkResults(session.stageChunkState.accumulatedChunkResults);
  setLiveMapSpaces(session.stageChunkState.liveMapSpaces);
  setShowLiveMap(session.stageChunkState.showLiveMap);
  console.log(`[Resume] Restored chunking: chunk ${session.stageChunkState.currentStageChunk + 1}/${session.stageChunkState.totalStageChunks}, ${session.stageChunkState.liveMapSpaces.length} spaces in map`);
}
```

#### D. **Continue Chunking on Resume** (lines 2238-2265)

Modified resume logic to continue from the next chunk:
```typescript
if (session.stageChunkState && session.stageChunkState.isStageChunking) {
  const nextChunkIndex = session.stageChunkState.currentStageChunk + 1;
  const chunkInfo = {
    isChunked: true,
    currentChunk: nextChunkIndex,
    totalChunks: session.stageChunkState.totalStageChunks,
    chunkLabel: `Space ${nextChunkIndex} of ${session.stageChunkState.totalStageChunks}`,
  };
  console.log(`[Resume] Continuing stage chunking from chunk ${nextChunkIndex}/${session.stageChunkState.totalStageChunks}`);
  showStageOutput(
    session.currentStageIndex,
    session.config as unknown as GenerationConfig,
    session.stageResults as unknown as StageResults,
    session.factpack as unknown as Factpack || null,
    chunkInfo
  );
  alert(`✅ Session Resumed!\n\nResumed at Stage ${session.currentStageIndex + 1}\nGenerating Space ${nextChunkIndex} of ${session.stageChunkState.totalStageChunks}\n\n${session.stageChunkState.liveMapSpaces.length} spaces already generated.`);
}
```

#### E. **Improved Close Handler** (lines 4746-4777)

Changed from generic warning to context-aware message:
```typescript
const handleClose = () => {
  if (currentStageIndex >= 0 && currentStageIndex < STAGES.length) {
    // If auto-save is enabled and we have a progress session, data is saved
    const dataSaved = autoSaveEnabled && progressSession;

    const message = dataSaved
      ? 'Close this generation session?\n\n✅ Your progress has been auto-saved and you can resume later from the "Resume Session" option.'
      : 'Are you sure you want to close? Your progress will be lost. Click "Cancel" to continue, or "OK" to reset.';

    const confirmClose = window.confirm(message);
    if (!confirmClose) {
      return;
    }

    // Just close the modal - don't reset if data is saved
    if (dataSaved) {
      setModalMode(null);
      console.log('[Close] Session closed but saved. Can resume from:', progressSession.sessionId);
    } else {
      // Reset everything if not saved
      setCurrentStageIndex(-1);
      setModalMode(null);
      setSkipMode(false);
      setStageResults({} as StageResults);
      setConfig(null);
      setError(null);
    }
  } else {
    setModalMode(null);
    setSkipMode(false);
  }
};
```

## User Experience Improvements

### Before Fixes
❌ Clicking X warns "Your progress will be lost" (even though it's saved)
❌ Resume takes you to correct stage but loses chunking progress
❌ Live map disappears on resume
❌ Starts over from chunk 1 instead of continuing from where you left off
❌ User must regenerate all previously completed spaces

### After Fixes
✅ Clicking X shows friendly message: "Your progress has been auto-saved"
✅ Resume restores exact chunking state
✅ Live map reappears with all previously generated spaces
✅ Continues from the next chunk (e.g., "Generating Space 24 of 55")
✅ Alert shows: "23 spaces already generated"
✅ All accumulated chunk results restored

## Testing Scenario

### Test Case: Castle with 55 Spaces

1. **Start Generation**: Generate Castle Blood Forge (55 spaces)
2. **Progress to Space 23**: Let it generate 23 spaces
3. **Close Modal**: Click X
   - Should see: "Your progress has been auto-saved"
   - Session saved with `stageChunkState` containing 23 spaces
4. **Resume Session**: Click "Resume Session"
   - Should see: "Resumed at Stage 3 of 5"
   - Should see: "Generating Space 24 of 55"
   - Should see: "23 spaces already generated"
5. **Verify State**:
   - Live map shows all 23 spaces
   - Console shows: `[Resume] Restored chunking: chunk 24/55, 23 spaces in map`
   - Generation continues from space 24
6. **Complete Generation**: Let it finish all 55 spaces
   - `stageChunkState` cleared from session
   - Final results stored in `stageResults.spaces`

## Backward Compatibility

The `stageChunkState` field is optional (`stageChunkState?: StageChunkState`) to ensure:
- Old saved sessions without this field can still be loaded
- Sessions without chunking don't have unnecessary data
- Future sessions will include this field automatically

## Console Logging

New logs added for debugging:
- `[Auto-Save] Saved chunk N/M for StageName`
- `[Auto-Save] Cleared chunking state - stage complete`
- `[Resume] Restoring stage chunking state:` (full state object)
- `[Resume] Restored chunking: chunk N/M, X spaces in map`
- `[Resume] Continuing stage chunking from chunk N/M`
- `[Close] Session closed but saved. Can resume from: sessionId`

## Summary

The Location Generation System now provides **robust resume capability** for long-running iterative generations:
- ✅ State persisted after every chunk
- ✅ Safe to close browser at any time
- ✅ Resume picks up exactly where you left off
- ✅ Live map restored with all previous spaces
- ✅ No redundant regeneration
- ✅ Clear user feedback about save status
