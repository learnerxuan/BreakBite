<!-- impeccable:product-context:v1 -->
# BreakBite product context

## Platform

Responsive web application for desktop and mobile browsers.

## Users

- APU students choosing food between classes, often under time pressure.
- Kitchen operators maintaining menus, food information, stock and pickup orders.

## Product purpose

Help students find a suitable campus meal, order ahead from one or more kitchens and collect it within a realistic pickup window. Normal ordering must remain simple; timetable-assisted “Fit my break” planning is optional.

## Positioning

BreakBite is an independent APU-focused student project, not an official university service. It is a practical campus ordering tool rather than a delivery marketplace or a physical-queue measurement system.

## Operating context

- Students may have only a few minutes to browse before their next class.
- Preparation time, kitchen location, availability, dietary suitability and price need to be comparable at a glance.
- One basket may contain items from multiple kitchens, but each kitchen has its own pickup window, code and counter payment.
- Menus are samples until reviewed by their operators. Ingredient and allergen information may be incomplete and must say so clearly.

## Current capabilities

- Browse and search campus menus; filter by kitchen, category and declared allergens.
- Compare preparation estimates, stock and kitchen availability.
- Mix kitchens in one atomic checkout and choose feasible pickup windows.
- Save favourites, usual baskets and recent meals for review and repeat ordering.
- Review ingredients, spice levels, dietary declarations, contains/may-contain warnings and evidence references.
- Use QR or manual pickup codes, counter payment confirmation, notices and recovery tools.
- Optionally plan around manual, imported or confirmed APSpace timetable gaps.

## Constraints and boundaries

- No physical-queue measurement or historical demand prediction.
- No invented nutrition, allergy guarantee, certification or university endorsement.
- Halal and gluten-free claims require vendor-supplied evidence and review dates.
- Google Cloud, Firebase and actual Gemini Enterprise execution remain deferred.
- Local JSON storage is single-process; public deployment and campus-scale performance are not claimed.

## Brand commitments

- Keep the BreakBite name, existing “b” logo and warm ivory, deep green and orange palette.
- Make finding and ordering food feel fast, grounded and specific to campus life.
- Prefer clear operational information and food photography over decorative marketing sections.
- Avoid generic marketplace templates, excessive rounded cards and unsupported claims.

## Evidence on hand

- Tested TypeScript ordering, account, kitchen, QR, dietary and timetable flows.
- Project-purpose sample menus for eleven kitchens and supplied restaurant photographs.
- AI-generated illustrative dish images, labelled as samples.
- Automated tests and documented localhost browser journeys.
- No vendor certification, university endorsement, measured waiting-time reduction or verified public deployment.

## Product principles

1. Put the next useful choice first: meal, preparation time, location, price and add action.
2. Never trade food-safety clarity for visual simplicity.
3. Preserve ordinary ordering when optional planning, AI or device features are unavailable.
4. Treat every multi-kitchen checkout as all-or-nothing at placement, then fulfil kitchens independently.
5. Show uncertainty honestly: unknown is not safe, sample is not verified and an estimate is not a guarantee.
