# data-access-openrouter

The single OpenRouter client. `POST {OPENROUTER_BASE_URL}/chat/completions`, `Authorization: Bearer OPENROUTER_KEY`, OpenAI-compatible schema, model `minimax/minimax-m3` (paid; the `:free` id has no endpoint). One shared server key.
- Quota: 100 requests per user per day (`OPENROUTER_SHARED_DAILY_QUOTA_PER_USER`), checked before the call, cook + recommend combined.
- Log every call to `<project root>/log/YYYY-MM-DD.json`: timestamp, user id, feature, model requested and used, full prompt, full response, prompt/completion tokens, `usage.cost` USD, generation id, latency.
