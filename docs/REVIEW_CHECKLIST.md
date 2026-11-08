# v0.3 review checklist

- [ ] Follow every acceptance scenario in [RELEASE_0_3.md](RELEASE_0_3.md).
- [ ] Run `npm run check`; independently repeat browser journeys on a throwaway database.
- [ ] Check student, vendor and other-student permissions; verify no QR/codes leak through merchant snapshots.
- [ ] Verify all-or-nothing multi-kitchen stock/capacity, repeat clicks and lost-response recovery.
- [ ] Test QR/manual handover and payment on real devices over HTTPS, including denied camera permission and repeated scans.
- [ ] Verify current ingredients/restrictions during repeat orders, proposals and rescheduling.
- [ ] Test early Ready, vendor delay, overdue closure and correction without inventory restoration or unfair penalties.
- [ ] Import the actual student-exported `.ics`, inspect unsupported warnings, confirm times and test deletion.
- [ ] Verify menu/photo/evidence provenance with merchants. Do not imply official APU deployment.
- [ ] Check portrait/landscape, keyboards, focus, screen-reader labels and all empty/error states.
- [ ] Back up and restore the full JSON/media directory while stopped; keep credentials and personal data private.
- [ ] Verify server reminders separately from device notification delivery. No closed-browser push is currently implemented.
- [ ] Complete Google migration and real Gemini Enterprise integration separately before claiming those hackathon requirements.
