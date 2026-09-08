# feature-cook

SPEC §7. Cook mode for owned, saved and shared recipes. Per step, one AI question goes through data-access-openrouter (feature "cook"). Prompt assembly lives here: recipe context + current step + the question, written to conserve tokens; the user never pastes the recipe. No chat history is stored; each question is one stateless request.
