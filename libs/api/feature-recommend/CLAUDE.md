# feature-recommend

SPEC §8. Weather + time-of-day advice for Home (ranks several saved recipes) and Discover. Flow: IANA timezone from the client → city = segment after `/` → data-access-weather geocode → forecast (is_day, sunrise, sunset, weather_code) → prompt through data-access-openrouter (feature "recommend"). "View next" re-prompts with already-shown recipes excluded. Never IP or browser geolocation.
