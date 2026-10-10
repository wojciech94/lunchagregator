# Restaurant filter consistency

The restaurant listing now uses the same shared FilterToolbar and FilterPanel as offers. Both use semantic tokens, InputGroup search, the counted filter button, removable applied criteria, and one responsive Sheet layout. Restaurant price levels use outline ToggleGroup controls; cuisines use the same two-column Checkbox/Field layout as offers. The restaurant-specific lunch time and optional distance controls remain available.

Panel choices stay in a draft until submission. Cancel or dismiss leaves the applied criteria intact; reopening starts from those applied values. Search remains debounced outside the panel and does not include draft selections. Reset cancels pending search so it cannot restore cleared filters. Removing a criterion preserves all other criteria and the search. A default slider value is not an implicit distance restriction.

This is a local UI follow-up stacked on `8fb8737` (action consistency and warm dark theme), with fetched remote base `d66f034`. Restaurant filters retain their existing local-state persistence and server-action fetching; this change does not add URL/history persistence or a new sort option.

Validation: typecheck and lint passed (the same two existing unused-variable warnings outside this scope). The full unit/property suite passed: 1185 tests, 8 skipped. Six new restaurant-panel tests cover draft/apply, cancellation, individual removal, reset during pending search, debounce/minimum length, and opening during pending search. The existing 14 offer-filter integration tests pass with the shared components.

Browser checks on the real restaurant listing covered applying price/cuisine selections, removing only the price criterion to recover Pizza Si, canceling an added cuisine and reopening, reset, and Escape returning focus to the filter trigger. The 320px sheet has no horizontal overflow in light or dark mode; the desktop sheet uses the shared side-panel layout. No record mutation was performed. Distance preservation is covered by the component test; live geolocation and a complete accessibility audit are outside this validation.
