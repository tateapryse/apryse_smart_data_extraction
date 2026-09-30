# Apryse Investment Intelligence Demo — TODO

## Backend
- [x] Install @pdftron/pdfnet-node (Apryse Server SDK) dependency
- [x] Install @pdftron/data-extraction module binary (Linux x64)
- [x] Create tRPC procedure: extractData — accepts PDF upload, runs DataExtractionModule, returns JSON key-value pairs
- [x] Create tRPC procedure: analyzeWithAI — accepts extracted JSON, calls LLM, returns structured advisory insights
- [x] Mock extraction data based on real Contoso Cashew Fund fact sheet
- [x] APRYSE_LICENSE_KEY secret configured (real SDK activates when key is provided)

## Frontend
- [x] Design system: dark navy + gold accent, Inter font, professional banking aesthetic
- [x] Step 1: PDF upload zone with drag-and-drop, file picker, "Extracting data..." loading state
- [x] SDK code snippet display in Step 1
- [x] Step 2: Collapsible JSON viewer — compact summary by default, "Expand" toggle for full JSON
- [x] Step 3: "Analyze with AI" button with loading animation
- [x] Step 4: AI advisory insights panel — suitability, volatility, performance, fees, diversification, summary
- [x] All 4 steps visible on single scrollable page with clear step indicators
- [x] Smooth transitions and micro-interactions between steps
- [x] Executive summary card with gold gradient
- [x] Professional header with live demo indicator
- [x] Reset / start new analysis button

## Testing
- [x] Vitest: extractData procedure mock test (2 tests)
- [x] Vitest: analyzeWithAI procedure mock test (2 tests)
- [x] All 5 tests passing

## Lending Fulfillment Context Section
- [x] Token cost math section: Gemini 2.5 Pro pricing, 5,000 doc example, 30% savings calculation
- [x] Interactive cost calculator: sliders for doc count, avg tokens, reduction % → live cost comparison
- [x] Security & compliance case: on-premise vs cloud, GDPR/HIPAA/SOC 2, data residency
- [x] "Why Apryse" narrative section with key value props
- [x] Visual comparison table: Raw PDF pipeline vs Apryse-structured pipeline
- [x] Update page title/header to reflect lending fulfillment context

## WebViewer Integration
- [x] Download Apryse WebViewer package and upload static assets to CDN
- [x] Step 2: Embed WebViewer showing PDF with highlighted extraction bounding boxes
- [x] Step 4: Embed WebViewer showing AI advisory insights as PDF annotations/comments
- [x] Upload investment fact sheet PDF to CDN for WebViewer access

## Retheme & Annotation Fixes
- [x] Retheme to Pantone 485C red (#DA291C), #491217 dark red, white base
- [x] Fix WebViewer extraction annotations: Keys=red, Values=blue
- [x] Add Before/After visual in Step 2: unstructured PDF (X) vs structured JSON (checkmark)

## Theme & Annotation Refinements (Round 3)
- [x] Update primary to #EF1815 Crimson, secondary to #F5C6CB Azalea, base white
- [x] Remove black gradient from Executive Summary section
- [x] Remove black gradient from Strategic Recommendation section
- [x] Remove black gradient from 5,000 documents math section
- [x] Fix WebViewer annotations: draw tight borders around individual key/value text
- [x] Audit and correct all token cost figures in WhyApryseSection

## WebViewer Production Fix
- [x] Diagnose why WebViewer assets fail in production (404 → HTML returned instead of JS)
- [x] Fix WebViewer static asset serving via Express server route (not client/public)
- [x] Verify WebViewer loads correctly in production build

## Real Apryse JSON Integration
- [x] Replace mockExtractedData with full real Apryse SDK JSON output
- [x] Update WebViewer extraction highlights to use actual rect coordinates from JSON
- [x] Update AI advisory annotation regions to use actual rect coordinates
- [x] Update AI analysis content to reflect real extracted data
- [x] Comment out live extraction API call (keep server SDK setup intact)
