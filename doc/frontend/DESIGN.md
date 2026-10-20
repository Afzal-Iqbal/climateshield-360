---
name: ClimateShield Karachi
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#43474d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#74777e'
  outline-variant: '#c3c6ce'
  surface-tint: '#49607c'
  primary: '#001428'
  on-primary: '#ffffff'
  primary-container: '#0f2942'
  on-primary-container: '#7991af'
  inverse-primary: '#b0c9e8'
  secondary: '#006398'
  on-secondary: '#ffffff'
  secondary-container: '#5bb8fe'
  on-secondary-container: '#00476e'
  tertiary: '#220e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#401f00'
  on-tertiary-container: '#d77503'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4ff'
  primary-fixed-dim: '#b0c9e8'
  on-primary-fixed: '#011d35'
  on-primary-fixed-variant: '#314863'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#93ccff'
  on-secondary-fixed: '#001d31'
  on-secondary-fixed-variant: '#004b73'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: 0em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.005em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  metric-display:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.03em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system serves municipal decision-makers, disaster response teams, and field operators under the Sindh Provincial Disaster Management Authority (PDMA) and Karachi municipal emergency operations cells. The operational environment ranges from high-glare field tablets under direct sunlight to multi-screen civic command control rooms during cyclone alerts, urban flash floods, and severe heatwaves.

The core brand personality is:
- **Authoritative & Institutional**: Objective, unhurried, and grounded in institutional accountability.
- **Calm & De-escalating**: Free from gratuitous motion, saturated alarms, or sensory overload. Emergencies require clear heads; the UI minimizes cognitive friction.
- **Scientifically Transparent**: Explicitly conveys data provenance, confidence intervals, sensor reliability, and prediction bands instead of false certainty.
- **Civic & Inclusive**: Engineered with high-contrast accessibility (WCAG AAA baseline for critical operational telemetry) and structured for bidirectional script parity (English LTR and Urdu RTL).

The aesthetic approach combines **Corporate Modernism** with **Scientific Precision / Data-Dense Utility**. Visual clarity dominates: stark 1px architectural lines, soft neutral off-white foundations, maritime deep blues for sovereign identity, structured metadata tags, and strict color-symbolic redundancy (never relying solely on color to communicate hazard states).

## Colors

The palette is engineered specifically for mission-critical environmental risk monitoring under shifting daylight conditions. It rejects dark, sci-fi military tropes in favor of an official, high-contrast maritime government standard.

### Core Swatches
- **Primary Sovereign Navy (`#0F2942`)**: The definitive brand anchor used for command navigation, top-level status bars, primary actions, and primary statistical text.
- **Secondary Rain & Atmospheric Teal (`#0284C7`)**: Dedicated to hydrological monitoring, monsoon precipitation indices, tidal surge gauges, and secondary interactive states.
- **Tertiary Heat & Solar Amber (`#D97706`)**: Reserved for solar radiation, wet-bulb globe temperature (WBGT) warnings, and heat exhaustion thresholds.
- **Neutral Canvas Surface (`#F8FAFC`)**: Base page background, reducing eye strain across prolonged 12-hour disaster shifts, complemented by pure `#FFFFFF` container cards.

### Color-Blind Safe Risk Escalation Scale
Every alert tier requires three concurrent signifiers: background tint, high-contrast foreground text, and an explicit typographic/icon label. Never display bare color dots.
- **Low (`#059669` / Surface: `#ECFDF5` / Border: `#A7F3D0`)**: Normal operational levels; baseline telemetry.
- **Moderate (`#B45309` / Surface: `#FEF3C7` / Border: `#FDE68A`)**: Advisory watch; municipal teams placed on standby.
- **High (`#C2410C` / Surface: `#FFEDD5` / Border: `#FED7AA`)**: Active hazard imminent; mobilization of drainage and heat relief camps.
- **Severe (`#B91C1C` / Surface: `#FEE2E2` / Border: `#FECACA`)**: Direct threat to life and civil infrastructure; emergency evacuation/lockdown protocols.

### Uncertainty & Statistical Enclosures
- Confidence intervals: `rgba(14, 116, 144, 0.14)` fill with `#94A3B8` dashed boundary borders.
- Missing / Stale Telemetry: Neutral slate hatch pattern using `#CBD5E1`.

## Typography

The typographic hierarchy accommodates high-density scientific instrumentation and rapid tactical scanning.

- **Primary Interface (Inter)**: Handles general headlines, titles, body content, and executive summary layers. Open apertures, tall x-height, and clean geometric curves ensure legibility on low-resolution field screens.
- **Telemetry & Numbers**: All numeric weather readings (e.g., rainfall in mm/hr, WBGT in °C, atmospheric millibars, river discharge) must render with tabular figures enabled (`font-variant-numeric: tabular-nums;`) to prevent layout shifts during live data polling.
- **Scientific Monospace (JetBrains Mono)**: Applied strictly to non-prose metadata: station sensor IDs (e.g., `KHI-EAST-04`), UTC/PST timestamp headers, GPS coordinates, error codes, and audit trail records.
- **Bilingual Typographic Parity**: When toggled to Urdu, the font-stack falls back smoothly to an appropriate Naskh typeface (e.g., `Noto Nastaliq Urdu` or `Noto Sans Arabic`), with line heights scaled by 1.35x across all standard body and title levels to preserve legibility of calligraphic diacritics.

## Layout & Spacing

This design system uses a strict 8-point baseline grid with a 4px half-step for micro-alignment of data chips and numeric units.

### Grid Architecture
- **Desktop (>= 1280px)**: 12-column fluid grid. Standard canvas margin is 32px (`2rem`) with 24px (`1.5rem`) column gutters. Dashboard split view maintains a persistent 320px left navigation/critical-status sidebar and an adaptable main workspace for map, hydrograph, and district risk matrices.
- **Tablet (768px – 1279px)**: 8-column layout with 24px canvas margins and 16px gutters. Navigation collapses into an accessible command drawer.
- **Mobile (< 768px)**: 4-column layout with 16px canvas margins and 16px gutters. Telemetry cards stack vertically into unified operational single-column modules.

### Vertical Spacing & Rhythm
- Inter-card gap: Always 16px (`space-md`) on mobile, 24px (`space-lg`) on desktop.
- Metric-to-label separation: 4px (`space-xs`).
- Grouped telemetry clusters: 8px (`space-sm`).
- Section demarcation: 32px (`space-xl`).

## Elevation & Depth

Visual hierarchy is communicated via clean structural framing and crisp tonal boundaries rather than high-blur drop shadows. This ensures visual fidelity on low-end displays in sunlight.

1. **Base Foundation (Level 0)**: `#F8FAFC` base surface. All default non-interactive areas reside here.
2. **Container Tier (Level 1)**: Pure `#FFFFFF` surfaces bounded by a solid `1px` border of `#E2E8F0`. Shadows are minimal and diffuse: `0px 1px 3px rgba(15, 41, 66, 0.05), 0px 1px 2px rgba(15, 41, 66, 0.03)`.
3. **Elevated Overlays & Interactive Flyouts (Level 2)**: Map control widgets, contextual tooltips, and station inspection drawers use `#FFFFFF`, a `1px` border of `#CBD5E1`, and an ambient shadow: `0px 4px 6px -1px rgba(15, 41, 66, 0.08), 0px 2px 4px -2px rgba(15, 41, 66, 0.04)`.
4. **Emergency Priority Modal / Interruption (Level 3)**: Critical alerts (e.g., immediate dam overflow or flash flood warning) overlay a deep navy scrim (`rgba(15, 41, 66, 0.6)`) with high-depth elevation: `0px 20px 25px -5px rgba(15, 41, 66, 0.12), 0px 8px 10px -6px rgba(15, 41, 66, 0.06)`.

## Shapes

The interface balances modern UI friendliness with institutional seriousness. A balanced roundedness token scale (`2`) is selected:

- **Base Components (Inputs, Buttons, Dropdowns)**: `0.5rem` (8px). Delivers a defined, dependable silhouette.
- **Containers & Station Cards (`rounded-lg`)**: `0.75rem` (12px). Creates smooth visual bounding boxes that differentiate modular dashboard tiles without feeling cartoonish or casual.
- **Status & Risk Badges (Pills)**: Fully pill-shaped (`9999px`) to immediately distinguish small status tags from clickable rectangular buttons or square filter inputs.
- **Charts & Confidence Shading Enclosures**: Outer corners match 8px; inner graph clipping paths remain precise 0px sharp boundaries to avoid obscuring chart data points.

## Components

### Buttons
- **Primary Command Button**: Filled `#0F2942` with `#FFFFFF` text. Focus state features a 2px offset ring in `#0284C7`. Minimum touch target is 44px height.
- **Secondary Atmospheric Button**: Bounded by 1px `#CBD5E1` border, surface `#FFFFFF`, text `#0F2942`. Hover triggers `#F1F5F9`.
- **Destructive / Emergency Action**: Filled `#DC2626` text `#FFFFFF`. Used strictly for operational escalations (e.g., "Issue Red Alert to District East").

### Chips & Badges
- **Risk Indicator Badges**: Pill-shaped with a distinct `1px` structural outline matching the risk border color. Always composed of: `[Hazard Icon] + [Tier Text] + [Value or Delta]`.
- **Data Provenance Pills**: Background `#F1F5F9`, border `#E2E8F0`, text `#475569`, font `JetBrains Mono` 11px. Prefixes include: `[MEASURED]`, `[INDICATOR-MODEL]`, `[LIMITED-DATA]`, or `[SAMPLE DATA]`.

### Cards & Station Panels
Cards use a solid white background, 1px `#E2E8F0` border, and 12px border radius. 
- **Header**: Contains the district or union council name (`Inter 16px semi-bold`), sensor status indicator (e.g., "Online - 2m ago" in JetBrains Mono), and an optional alert pill.
- **Body**: Dense layout of statistical readouts using `metric-display` for primary indicators paired with unit labels in `body-sm`.
- **Footer**: Provenance tag and confidence rating with a dashed comparison line link.

### Input Fields & Selectors
- Background `#FFFFFF`, border 1px `#CBD5E1`, padding 10px 14px, corner radius 8px.
- Focus: 1px `#0284C7` and an outer halo of `rgba(2, 132, 199, 0.2)`.
- Includes explicit support for right-aligned input decorators when Urdu locale is activated.

### Data Visualizations & Hazard Maps
- **Confidence Intervals**: Represented by translucent fills (`rgba(14, 116, 144, 0.15)`) flanked by two 1px dashed `#94A3B8` lines denoting 10th and 90th percentile bounds.
- **Threshold Lines**: Horizontal 1.5px dashed lines in `#DC2626` for danger thresholds, accompanied by pinned right-aligned numerical tags.