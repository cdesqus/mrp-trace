# MRP Traceability

Greenfield traceability system covering Sales Order, Production Order, reusable Tray
cycles, laser serial marking, QC/Rework, Packing, Delivery Order and backward
traceability.

## Business rules implemented

- Production quantity is created from the Sales Order line quantity.
- A physical tray keeps one permanent QR; each use creates a new Tray Cycle.
- Commercial serial format is `YYMMDD` plus an eight-digit global sequence.
- Serial groups use the active packaging capacity (for example 6 or 12 FG).
- All serials in a Small Box are consecutive; a group waits for its rework unit.
- Rework retains the original serial number.
- Partial final Small/Master Boxes are supported for unrestricted SO quantities.
- TCP device output is persisted and retried after the business transaction commits.

## Run

```powershell
docker compose up --build
```

- Web: http://localhost:3018
- API health: http://localhost:8090/health
- PostgreSQL: localhost:5444 (`mrp` / `mrp`)

Device addresses are configured through `LASER_ADDR`, `REWORK_PRINTER_ADDR`,
`SMALL_BOX_PRINTER_ADDR`, and `MASTER_BOX_PRINTER_ADDR`.

All station API calls require `X-Operator-ID` and `X-Station-ID` headers.

## Local simulator and server mode

- Local frontend development may use `frontend/.env.local` with
  `NEXT_PUBLIC_DEMO_MODE=true`. This file is ignored by Git and Docker.
- Docker and server builds explicitly use `NEXT_PUBLIC_DEMO_MODE=false`.
- In server mode, all `/api` requests go to the Go backend and PostgreSQL.
  Browser LocalStorage simulator data is not used.
- `NEXT_PUBLIC_DEMO_MODE` is embedded during `npm run build`; set it before
  building the frontend image.

Use `frontend/.env.example` as the safe deployment template.

## Main endpoints

- `POST /api/sales-orders`
- `POST /api/trays/assign`
- `POST /api/qc/serial-groups`
- `POST /api/qc/laser-next`
- `POST /api/qc/evaluate`
- `GET /api/packing/queue`
- `POST /api/packing/small-box`
- `POST /api/packing/master-box`
- `POST /api/delivery-orders`
- `POST /api/delivery-orders/:id/master-boxes`
- `GET /api/trace/:serial`
