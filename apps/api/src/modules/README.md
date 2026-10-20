# Tool modules

Create one folder per tool here. A module owns its HTTP handlers, application logic, and later its database migrations. Do not place tool-specific logic in `core/`.

Example:

```text
modules/invoice-reminder/
  routes.ts
  service.ts
  db/001_initial.sql
```
