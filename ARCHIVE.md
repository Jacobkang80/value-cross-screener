# Source archive

- Origin: existing Value Cross Sites source checkout.
- Source revision: `6f8631dda81b56aaf85ece083d716867b5d6b928`.
- GitHub export: removed personal connection and deployment identifiers; added example configurations and build fallbacks.
- Core collector and screening logic are unchanged from the source revision.
- Known limits: official KRX PER/PBR retrieval remains unavailable in the tested environment; Google Sheets automatic writes are not connected.

## Cache compatibility fix

Remove access to the Cloudflare default cache, which is not permitted in the Sites production runtime. Preserve per-process memoization and add a regression test for restricted cache access.
