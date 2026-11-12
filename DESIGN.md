---
name: BreakBite
description: A warm, timing-led campus food ordering system.
colors:
  campus-green: "#183c31"
  pickup-orange: "#dc552e"
  pickup-orange-dark: "#ba3f1d"
  warm-paper: "#fbfaf6"
  fresh-mint: "#eaf1e7"
  quiet-text: "#67756c"
  hairline: "#e6e7df"
  white: "#ffffff"
typography:
  display:
    fontSize: "clamp(34px, 4.2vw, 58px)"
    fontWeight: 820
    lineHeight: 0.98
    letterSpacing: "-2.2px"
  title:
    fontSize: "18px"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "-0.35px"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0.035em"
rounded:
  tight: "5px"
  control: "8px"
  surface: "10px"
  panel: "20px"
spacing:
  hairline: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.pickup-orange}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.pickup-orange-dark}"
    textColor: "{colors.white}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.campus-green}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.campus-green}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
    height: "44px"
  chip-active:
    backgroundColor: "{colors.campus-green}"
    textColor: "{colors.white}"
    rounded: "{rounded.tight}"
    padding: "8px 14px"
---

# Design System: BreakBite

## Overview

**Creative North Star: "The Calibrated Lunch Counter"**

BreakBite combines the warmth of a familiar campus food counter with the precision of an operating timetable. Warm paper and food photography keep the system approachable; deep green structure, orange actions and fine timing marks make it fast to scan under time pressure. Information density is deliberate: preparation, location, dietary state, price and action should be comparable without turning the interface into a generic marketplace grid.

The visual world is flat, practical and specific to campus life. It rejects decorative hero sections, excessive floating cards and unsupported promotional claims. The logo and green-orange identity remain constant while compact rows and tabular timing figures do the operational work.

**Key Characteristics:**
- Warm ivory ground with deep green structure and sparse orange action color.
- Dense, hairline-separated registrations rather than card collections.
- Preparation time expressed as a shared visual scale and tabular figures.
- Food imagery and plain language balancing the technical timing grammar.
- Safety, stock and kitchen state remain visible at the point of choice. Stored sample provenance does not imply operator verification.

## Colors

The palette is small and functional: green establishes trust and structure, orange marks action and timing, and warm neutrals keep food content inviting.

### Primary
- **Campus Green:** The dominant ink, selected state and structural rule color. It carries headings, navigation emphasis and the mobile basket bar.

### Secondary
- **Pickup Orange:** Reserved for primary actions, preparation markers and small brand accents.
- **Deep Pickup Orange:** Hover and pressed emphasis for primary actions.

### Neutral
- **Warm Paper:** The application canvas; warmer than pure white so white controls remain visible.
- **Fresh Mint:** Quiet active navigation, badges and supportive dietary surfaces.
- **Quiet Text:** Secondary copy, captions and non-critical metadata.
- **Hairline:** Borders and dividers that organize dense information without creating boxes everywhere.
- **White:** Inputs, timing rail and basket surfaces.

### Named Rules

**The Orange Means Action Rule.** Use orange for actions, timing marks and the logo accent; do not flood large surfaces with it.

**The Safety Stays Visible Rule.** Dietary tags, declared allergens and unknown states remain legible on desktop and mobile.

## Typography

**Display Font:** Inherits the product sans-serif stack.
**Body Font:** Inter with UI/system fallbacks.
**Label/Mono Font:** The body stack with tabular numerals for time and price.

**Character:** Compact, direct and operational. Weight and spacing create hierarchy; the interface does not depend on a decorative display face.

### Hierarchy
- **Display** (820, fluid 34–58px, 0.98): Task-first page headings with tight negative tracking.
- **Headline** (750, 18–26px, approximately 1.2): Section and panel headings.
- **Title** (750, 15–17px, 1.3): Meal and kitchen titles.
- **Body** (400, 15px, 1.55): Explanatory and transactional copy.
- **Label** (650, 9–10px, modest tracking): Kitchen/location metadata, timing units and table labels.

### Named Rules

**The Number Before Noun Rule.** Preparation minutes and prices use tabular numerals and lead their supporting units or labels.

## Layout

The application sits in a centered frame with desktop gutters. A full-width search row leads into three pickup-area photo panels using the supplied kitchen photographs, grouped from current saved locations. Cafeteria, Atrium and Above Centre Point contain six, one and two active kitchens in the initial catalogue. Below this, Explore uses a flexible menu register and a 330px sticky basket separated by a 24px gap. Meal-type, diet/spice and clear allergen controls appear before the optional preparation-time filter. Phones show all three area tiles together and retain fixed basket shortcuts.

Meal rows use four aligned zones: 126px food image, flexible description, 68px preparation figure and 92px price/action. At 1180px these compress; at 860px the basket moves into normal flow. At 600px, search becomes two rows and each meal becomes a compact image/body/action arrangement. Core touch actions are at least 44px high. The mobile basket shortcut stays fixed while basket contents scroll independently from the pinned checkout action.

Spacing follows a compact 8/12/16/24/32px rhythm. Hairline rules, not large empty gaps, group related operational content.

## Elevation & Depth

The system is flat by default. White surfaces separate from warm paper through one-pixel borders and tonal contrast. Shadows are reserved for stateful elevation: a restrained meal hover, the pinned mobile basket and the basket action shelf.

### Shadow Vocabulary
- **Hover Lift** (`0 12px 28px #183c310b`): Legacy card hover only; timing-led meal rows use a white background change instead.
- **Mobile Dock** (`0 8px 30px #183c3133`): Fixed mobile basket shortcut.
- **Action Shelf** (`0 -10px 22px #183c310a`): Separates pinned basket actions from scrollable contents.

### Named Rules

**The Flat-by-Default Rule.** Use borders and tonal layering at rest; shadows indicate hover or pinned layers, not decoration.

## Shapes

Controls use gently squared 5–10px corners. The timing rail and basket are compact technical surfaces, not soft promotional cards. Larger 20px radii remain for legacy panels and dialogs. Favourite controls and count badges are circular because their meaning benefits from a compact icon target.

## Components

### Buttons
- **Shape:** Gently squared controls (7–11px radius) with a 44px minimum height.
- **Primary:** Pickup Orange with white text; darkens on hover.
- **Secondary:** White with a hairline border and green text; gains a soft neutral fill on hover.
- **Focus:** Three-pixel warm orange outline with three-pixel offset.

### Chips
- **Style:** White, fine border, compact label and 5–6px corners on Explore.
- **State:** Active categories invert to Campus Green with white text. Allergy filters use a pale warning tint and explicit “Avoid” copy.

### Cards / Containers
- **Corner Style:** Compact 8–10px on operational surfaces; 20px on larger legacy panels.
- **Background:** White on Warm Paper.
- **Shadow Strategy:** Flat at rest.
- **Border:** One-pixel Hairline or slightly stronger green-grey on timing surfaces.
- **Internal Padding:** 12–24px according to density.

### Inputs / Fields
- **Style:** White, 1px neutral border, 8–10px radius and 44px minimum height.
- **Focus:** Shared high-contrast focus outline.
- **Error / Disabled:** Error surfaces use pale warm red; disabled actions reduce opacity without removing their label.

### Navigation
- **Style:** Sticky white header with the existing BreakBite logo. Active views use Fresh Mint and Campus Green; navigation remains horizontally scrollable on narrow screens.

### Preparation-Time Rail

A white, fine-bordered preparation panel offers maximum-estimate buttons for 1–11 minutes and an unbounded 12+/All option. Counts are cumulative within the other current filters. It filters menu estimates, not pickup availability or kitchen workload. It starts expanded on desktop and collapsed on phones/tablets; the user's choice and keyboard focus survive polling. Each button has an explicit accessible maximum and result count.

### Allergy Control

Use a warm orange-tinted background, a strong orange outline, a warning icon, bold “Allergy filters”, an underlined “Choose allergens to avoid” action and a directional chevron. The whole disclosure is clickable and at least 56px high. Selected counts remain visible while collapsed. Expansion and focus survive refresh; unknown or unreviewed information is excluded by active allergy/diet filters. Browse filters do not overwrite saved food preferences.

### Meal Register

Desktop meals are rows separated by hairlines, with aligned preparation and price columns. Mobile keeps the image, food-safety tags, full allergen note, preparation estimate, price and Add action visible. The user's requested removal of visible sample labels is preserved; unknown dietary information and stored provenance remain intact. Mid-width desktop rows rearrange their preparation and price blocks to leave the meal description readable beside the basket.

## Do's and Don'ts

### Do:
- **Do** open food-finding surfaces on the task, filters and comparable meal data.
- **Do** keep preparation figures, locations, prices and dietary states scannable together.
- **Do** use Warm Paper, Campus Green and Pickup Orange as the recognizable BreakBite world.
- **Do** keep mobile controls comfortable and basket checkout actions reachable with long orders.
- **Do** retain truthful image provenance in stored metadata and documentation; respect the user's chosen display of those labels.

### Don't:
- **Don't** reintroduce a decorative marketing hero above the ordering task.
- **Don't** turn every result into an isolated rounded card or add shadows without a state purpose.
- **Don't** hide or clip allergen warnings and unknown dietary states on narrow screens.
- **Don't** invent nutrition, certification, availability or waiting-time claims.
- **Don't** use orange as a broad background treatment; its scarcity makes actions clear.
