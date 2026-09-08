# libs/

Layout `libs/<scope>/<type>-<name>`, imported as `@rsn/<scope>/<type>-<name>`. Every project.json carries tags `scope:*` and `type:*`; `@nx/enforce-module-boundaries` enforces:
- scope: shared→shared; api→api,shared; web→web,shared; desktop→shared.
- type: feature→feature,data-access,ui,util; data-access→data-access,util; ui→ui,util; util→util.
An untagged project may import nothing. Unit tests sit beside the code as `*.spec.ts`.
